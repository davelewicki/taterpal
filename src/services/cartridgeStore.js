import { get, set, del } from 'idb-keyval';
import { compileAbcToDatabase } from '@/js/abcCompiler.js';

const CARTRIDGES_META_KEY = 'cartridges_meta';

export const DEFAULT_CARTRIDGE = {
    id: 'default',
    name: 'Built-in Old Time Collection',
    tuneCount: 6945,
    enabled: true,
    isDefault: true,
    sourceType: 'built-in'
};

class CartridgeStore {
    async getCartridges() {
        let meta = await get(CARTRIDGES_META_KEY);
        if (!meta || !Array.isArray(meta)) {
            meta = [DEFAULT_CARTRIDGE];
            await set(CARTRIDGES_META_KEY, meta);
        }
        return meta;
    }

    async saveCartridgesMeta(meta) {
        await set(CARTRIDGES_META_KEY, meta);
    }

    async toggleCartridge(id, enabled) {
        const meta = await this.getCartridges();
        const item = meta.find(c => c.id === id);
        if (item) {
            item.enabled = enabled;
            await this.saveCartridgesMeta(meta);
        }
    }

    async deleteCartridge(id) {
        if (id === 'default') return; // Cannot delete built-in database
        let meta = await this.getCartridges();
        meta = meta.filter(c => c.id !== id);
        await this.saveCartridgesMeta(meta);
        await del(`cartridge_db_${id}`);
    }

    async addCartridgeFromAbcText(name, rawAbcText, sourceType = 'abc_text', sourceUrl = '') {
        const compiled = compileAbcToDatabase(rawAbcText, name);
        const tuneCount = Object.keys(compiled.settings).length;

        if (tuneCount === 0) {
            throw new Error('No valid tunes with pitch contours could be parsed from the provided ABC notation.');
        }

        const id = 'cartridge_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);

        // Separate ABC strings from WASM index object just like default database does
        const abcStrings = {};
        for (const settingId in compiled.settings) {
            abcStrings[settingId] = compiled.settings[settingId].abc;
            compiled.settings[settingId].abc = '';
        }

        const cartridgeData = {
            indexData: compiled,
            abcStrings: abcStrings
        };

        await set(`cartridge_db_${id}`, cartridgeData);

        const meta = await this.getCartridges();
        const newCartridge = {
            id,
            name: name || `Custom Book (${tuneCount} tunes)`,
            tuneCount,
            enabled: true,
            isDefault: false,
            sourceType,
            sourceUrl,
            createdAt: new Date().toISOString()
        };

        meta.push(newCartridge);
        await this.saveCartridgesMeta(meta);
        return newCartridge;
    }

    async addCartridgeFromAbcUrl(url, customName = '') {
        const res = await fetch(url);
        if (!res.ok) {
            throw new Error(`Failed to fetch ABC file from URL (HTTP ${res.status})`);
        }
        const abcText = await res.text();
        const fallbackName = customName || url.split('/').pop().replace(/\.abc$/i, '') || 'URL Book';
        return await this.addCartridgeFromAbcText(fallbackName, abcText, 'abc_url', url);
    }

    async addCartridgeFromSnarchUrl(snarchUrl, customName = '') {
        // Extract bookId from url formats:
        //  - https://snarch.app/book/12345
        //  - https://snarch.app/#/book/12345
        //  - 12345
        let bookId = snarchUrl.trim();
        const match = bookId.match(/book\/([a-zA-Z0-9_\-]+)/);
        if (match) {
            bookId = match[1];
        }

        if (!bookId) {
            throw new Error('Invalid Snarch book URL or ID.');
        }

        // Request export from Snarch API endpoint
        const exportUrl = `https://snarch.app/api/book/export/${bookId}`;
        const res = await fetch(exportUrl);
        if (!res.ok) {
            throw new Error(`Could not fetch book export from Snarch (HTTP ${res.status}). Make sure the book ID exists.`);
        }

        const abcText = await res.text();
        const bookTitle = res.headers.get('x-book-title') || customName || `Snarch Book (${bookId})`;
        return await this.addCartridgeFromAbcText(bookTitle, abcText, 'snarch_url', snarchUrl);
    }

    async getMergedCartridgesData(defaultTuneIndexData = null) {
        const meta = await this.getCartridges();
        const enabledCartridges = meta.filter(c => c.enabled);

        const mergedSettings = {};
        const mergedAliases = {};
        const mergedAbcStrings = {};

        for (const cartridge of enabledCartridges) {
            if (cartridge.id === 'default') {
                if (!defaultTuneIndexData) continue;
                // Merge default database
                const defaultSettings = defaultTuneIndexData.indexData.settings;
                const defaultAliases = defaultTuneIndexData.indexData.aliases;
                const defaultAbc = defaultTuneIndexData.abcStrings;

                for (const settingId in defaultSettings) {
                    const prefixedSettingId = `def_${settingId}`;
                    const settingObj = defaultSettings[settingId];
                    const originalTuneId = settingObj.tune_id || settingId;
                    const prefixedTuneId = `def_${originalTuneId}`;

                    mergedSettings[prefixedSettingId] = {
                        ...settingObj,
                        tune_id: prefixedTuneId,
                        cartridgeName: cartridge.name,
                        cartridgeId: 'default'
                    };
                    mergedAbcStrings[prefixedSettingId] = defaultAbc[settingId] || '';
                }

                for (const tuneId in defaultAliases) {
                    const prefixedTuneId = `def_${tuneId}`;
                    mergedAliases[prefixedTuneId] = defaultAliases[tuneId];
                }
            } else {
                const cartridgeData = await get(`cartridge_db_${cartridge.id}`);
                if (!cartridgeData || !cartridgeData.indexData) continue;

                const cSettings = cartridgeData.indexData.settings;
                const cAliases = cartridgeData.indexData.aliases;
                const cAbc = cartridgeData.abcStrings;

                for (const settingId in cSettings) {
                    const prefixedSettingId = `${cartridge.id}_${settingId}`;
                    const settingObj = cSettings[settingId];
                    const originalTuneId = settingObj.tune_id || settingId;
                    const prefixedTuneId = `${cartridge.id}_${originalTuneId}`;

                    mergedSettings[prefixedSettingId] = {
                        ...settingObj,
                        tune_id: prefixedTuneId,
                        cartridgeName: cartridge.name,
                        cartridgeId: cartridge.id
                    };
                    mergedAbcStrings[prefixedSettingId] = cAbc[settingId] || '';
                }

                for (const tuneId in cAliases) {
                    const prefixedTuneId = `${cartridge.id}_${tuneId}`;
                    mergedAliases[prefixedTuneId] = cAliases[tuneId];
                }
            }
        }

        return {
            indexData: {
                settings: mergedSettings,
                aliases: mergedAliases
            },
            abcStrings: mergedAbcStrings
        };
    }
}

export const cartridgeStore = new CartridgeStore();
