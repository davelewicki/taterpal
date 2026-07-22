import * as Comlink from '@/js/comlink';
import ffConfig from '@/ffConfig';
import {get,
    set
} from 'idb-keyval';

import { cartridgeStore } from '@/services/cartridgeStore';

class FolkFriendWASMWrapper {
    constructor() {
        this.folkfriendWASM = null;
        this.abcStringBySetting = {};
        this.defaultTuneIndex = null;

        this.loadedWASM = new Promise(resolve => {
            this.setLoadedWASM = resolve;
        });
        this.loadedIndex = new Promise(resolve => {
            this.setLoadedIndex = resolve;
        });
        this.loadedSampleRate = new Promise(resolve => {
            this.setLoadedSampleRate = resolve;
        });

        // eslint-disable-next-line no-undef
        import ('@/wasm/folkfriend.js').then(async wasm => {
            // eslint-disable-next-line no-undef
            await wasm.default(`${__webpack_public_path__}folkfriend_bg.wasm`);
            this.folkfriendWASM = new wasm.FolkFriendWASM();
            this.setLoadedWASM();
        });
    }

    async version(cb) {
        await this.loadedWASM;
        cb(this.folkfriendWASM.version());
    }

    async onIndexLoad(cb) {
        await this.loadedWASM;
        await this.loadedIndex;
        cb();
    }

    async fetchTuneIndexMetadata() {
        // eslint-disable-next-line no-undef
        let url = `${__webpack_public_path__}res/nud-meta.json?_=${Date.now()}`;
        let indexData = await fetch(url)
            .then((response) => response.json())
            .catch((err) => console.log(err));
        return indexData;
    }

    async fetchTuneIndexData() {
        console.time('index-fetch');

        // eslint-disable-next-line no-undef
        let url = `${__webpack_public_path__}res/folkfriend-non-user-data.json?_=${Date.now()}`;

        // Fetch
        let indexData = await fetch(url)
            .then((response) => response.json())
            .catch((err) => console.log(err));

        // Lightly postprocess. ABC strings don't go to WASM because
        //  of slow memory loading in WebAssembly.        
        let abcStringBySetting = {};
        for (let settingID in indexData.settings) {
            abcStringBySetting[settingID] = indexData.settings[settingID].abc;
            indexData.settings[settingID].abc = '';
        }

        const downloadedTuneIndex = {
            indexData: indexData,
            abcStrings: abcStringBySetting
        };
        console.timeEnd('index-fetch');

        return downloadedTuneIndex;
    }

    async setupTuneIndex(cb) {
        let t0 = performance.now();
        let analyticsData = {
            'newly_installed': false,
            'newly_updated': false
        };
        console.time('tune-index-setup');

        const isLocalhost = typeof self !== 'undefined' && self.location && (self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1');
        let localTuneIndex = isLocalhost ? undefined : await get('tuneIndex');

        if (typeof localTuneIndex === 'undefined') {
            console.debug('No tune index was cached or running on localhost, requesting download');
            const downloadedTuneIndex = await this.fetchTuneIndexData();
            this.defaultTuneIndex = downloadedTuneIndex;
            const tuneIndexMetadata = await this.fetchTuneIndexMetadata();
            await set('tuneIndex', downloadedTuneIndex);
            await set('tuneIndexMetadata', tuneIndexMetadata);
        } else {
            console.debug('Found cached tune index');
            this.defaultTuneIndex = localTuneIndex;

            const tuneIndexMetadataRemote = await this.fetchTuneIndexMetadata();
            let tuneIndexMetadataLocal = await get('tuneIndexMetadata');
            if (typeof tuneIndexMetadataLocal === 'undefined') {
                tuneIndexMetadataLocal = { 'v': 0 };
            }

            const remoteVersion = tuneIndexMetadataRemote['v'];
            const localVersion = tuneIndexMetadataLocal['v'];
            if (remoteVersion !== localVersion) {
                console.debug('Upgrading tune index to version', remoteVersion);
                const downloadedTuneIndex = await this.fetchTuneIndexData();
                this.defaultTuneIndex = downloadedTuneIndex;
                await set('tuneIndex', downloadedTuneIndex);
                await set('tuneIndexMetadata', tuneIndexMetadataRemote);
            }
        }

        await this.reloadActiveCartridges();
        console.timeEnd('tune-index-setup');
        let tEnd = performance.now();
        analyticsData['wall_time'] = tEnd - t0;
        if (cb) cb(analyticsData);
    }

    async reloadActiveCartridges(cb) {
        console.time('reload-active-cartridges');
        const mergedData = await cartridgeStore.getMergedCartridgesData(this.defaultTuneIndex);
        await this.loadTuneIndex(mergedData);
        console.timeEnd('reload-active-cartridges');
        if (cb) cb(true);
    }

    async loadTuneIndex(tuneIndex) {
        console.time('tune-index-to-wasm');
        await this.loadedWASM;
        const cleanIndexData = JSON.parse(JSON.stringify(tuneIndex.indexData));
        await this.folkfriendWASM.load_index_from_json_obj(cleanIndexData);
        this.abcStringBySetting = tuneIndex.abcStrings;
        this.setLoadedIndex();
        console.timeEnd('tune-index-to-wasm');
    }

    async setSampleRate(sampleRate) {
        await this.loadedWASM;

        // This can fail by returning false. We never actually check the return
        //  value because it can only fail if passed an invalid sample rate,
        //  and it's trivial to check the sample rate before passing that value
        //  into this worker. It should be impossible for an invalid sample 
        //  rate to make it to the worker, but even if it does the WASM backend
        //  simply ignores the invalid sample rate and stays on the default.
        await this.folkfriendWASM.set_sample_rate(sampleRate);
        this.setLoadedSampleRate();
    }

    async feedEntirePCMSignal(PCMSignal) {
        const frames = Math.floor(PCMSignal.length / ffConfig.SPEC_WINDOW_SIZE);
        if (frames === 0) {
            throw 'PCM signal too short';
        }
        for (let i = 0; i < frames; i++) {
            const PCMWindow = PCMSignal.slice(
                ffConfig.SPEC_WINDOW_SIZE * i,
                ffConfig.SPEC_WINDOW_SIZE * (i + 1)
            );
            await this.feedSinglePCMWindow(PCMWindow);
        }
    }

    async feedSinglePCMWindow(PCMWindow) {
        await this.loadedWASM;
        await this.loadedSampleRate;
        const ptr = await this.folkfriendWASM.alloc_single_pcm_window();
        const arr = await this.folkfriendWASM.get_allocated_pcm_window(ptr);

        arr.set(PCMWindow);

        await this.folkfriendWASM.feed_single_pcm_window(ptr);
        // console.debug("feedSinglePCMWindow: complete");
    }

    async flushPCMBuffer() {
        await this.folkfriendWASM.flush_pcm_buffer();
    }

    async transcribePCMBuffer(cb) {
        try {
            const contour = await this.folkfriendWASM.transcribe_pcm_buffer();
            cb(contour);
        } catch (e) {
            console.error(e);
            console.warn('Aborting transcribePCMBuffer');
            cb(JSON.stringify({
                'error': 'An error ocurred whilst transcribing audio.'
            }));
        }
    }

    async runTranscriptionQuery(query, cb) {
        await this.loadedWASM;
        await this.loadedIndex;
        const response = await this.folkfriendWASM.run_transcription_query(query);
        let results = JSON.parse(response);
        if (Array.isArray(results)) {
            for (let result of results) {
                if (result.setting) {
                    const id = result.setting_id || result.setting.tune_id;
                    result.setting.abc = this.abcStringBySetting[id] || '';
                }
            }
        }
        cb(results);
    }

    async runNameQuery(query, cb) {
        await this.loadedWASM;
        await this.loadedIndex;
        const response = await this.folkfriendWASM.run_name_query(query);
        let results = JSON.parse(response);
        if (Array.isArray(results)) {
            for (let result of results) {
                if (result.setting) {
                    const id = result.setting_id || result.setting.tune_id;
                    result.setting.abc = this.abcStringBySetting[id] || '';
                }
            }
        }
        cb(results);
    }

    async contourToAbc(contour, cb) {
        await this.loadedWASM;
        const abc = await this.folkfriendWASM.contour_to_abc(contour);
        cb(abc);
    }

    async settingsFromTuneID(tuneID, cb) {
        await this.loadedWASM;
        await this.loadedIndex;

        const response = await this.folkfriendWASM.settings_from_tune_id(tuneID);
        let settings = JSON.parse(response);

        // Recall that we delete the ABC string before passing data into WebAssembly,
        //  because otherwise it takes a lot of time every startup to load that data in
        //  and it's only used by the frontend and not the backend. So here we reinject
        //  the ABC strings that are stored in the worker.
        let settingsIncludingAbc = settings.map(([settingID, setting]) => {
            setting['setting_id'] = settingID;
            setting['abc'] = this.abcStringBySetting[settingID];
            return setting;
        });

        cb(settingsIncludingAbc);
    }

    async aliasesFromTuneID(tuneID, cb) {
        await this.loadedWASM;
        await this.loadedIndex;
        const aliases = await this.folkfriendWASM.aliases_from_tune_id(tuneID);
        cb(JSON.parse(aliases));
    }
}

const folkfriendWASMWrapper = new FolkFriendWASMWrapper();
Comlink.expose(folkfriendWASMWrapper);