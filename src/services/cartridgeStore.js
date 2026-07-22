import { get, set, del } from 'idb-keyval';
import { compileAbcToDatabase } from '@/js/abcCompiler.js';

const CARTRIDGES_META_KEY = 'cartridges_meta';

export const DEFAULT_CARTRIDGE = {
    id: 'default',
    name: 'Built-in Old Time Collection',
    tuneCount: 6945,
    enabled: true,
    installed: true,
    isDefault: true,
    sourceType: 'built-in'
};

export const FOLKFRIEND_PRESET_CARTRIDGE = {
    id: 'cartridge_original_folkfriend',
    name: 'Original FolkFriend Irish Collection (thesession.org)',
    tuneCount: 29000,
    enabled: false,
    installed: false,
    isDefault: false,
    sourceType: 'preset',
    sourceUrl: 'https://folkfriend-app-data.web.app/folkfriend-non-user-data.json'
};

export function sortCartridges(cartridges) {
    if (!Array.isArray(cartridges)) return [];
    const defaultCartridge = cartridges.find(c => c.isDefault);
    const defaultIsOff = defaultCartridge && !defaultCartridge.enabled;

    return [...cartridges].sort((a, b) => {
        // If default collection is OFF, always force it to the end
        if (defaultIsOff) {
            if (a.isDefault) return 1;
            if (b.isDefault) return -1;
        }

        // Alphabetical sorting by cartridge name (case-insensitive)
        const nameA = (a.name || '').toLowerCase();
        const nameB = (b.name || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
}

class CartridgeStore {
    async getCartridges() {
        let meta = await get(CARTRIDGES_META_KEY);
        if (!meta || !Array.isArray(meta)) {
            meta = [DEFAULT_CARTRIDGE, { ...FOLKFRIEND_PRESET_CARTRIDGE }];
            await set(CARTRIDGES_META_KEY, meta);
        } else {
            // Ensure FOLKFRIEND_PRESET_CARTRIDGE slot is present in meta array
            if (!meta.some(c => c.id === FOLKFRIEND_PRESET_CARTRIDGE.id)) {
                meta.push({ ...FOLKFRIEND_PRESET_CARTRIDGE });
                await set(CARTRIDGES_META_KEY, meta);
            }
        }
        return sortCartridges(meta);
    }

    async saveCartridgesMeta(meta) {
        await set(CARTRIDGES_META_KEY, meta);
    }

    async toggleCartridge(id, enabled) {
        const meta = await this.getCartridges();
        const item = meta.find(c => c.id === id);
        if (item) {
            if (id === 'cartridge_original_folkfriend' && enabled && !item.installed) {
                // User turned switch ON for uninstalled preset -> download and install!
                await this.installFolkFriendPreset();
                const freshMeta = await this.getCartridges();
                const defaultItem = freshMeta.find(c => c.id === 'default');
                if (defaultItem) defaultItem.enabled = false;
                await this.saveCartridgesMeta(freshMeta);
                return;
            }

            item.enabled = enabled;

            // Enforce mutual exclusivity between Default Old-Time and Irish Collection
            if (enabled) {
                if (id === 'default') {
                    const irishItem = meta.find(c => c.id === 'cartridge_original_folkfriend');
                    if (irishItem) irishItem.enabled = false;
                } else if (id === 'cartridge_original_folkfriend') {
                    const defaultItem = meta.find(c => c.id === 'default');
                    if (defaultItem) defaultItem.enabled = false;
                }
            }

            await this.saveCartridgesMeta(meta);
        }
    }

    async deleteCartridge(id) {
        if (id === 'default') return; // Cannot delete built-in database
        let meta = await this.getCartridges();
        if (id === 'cartridge_original_folkfriend') {
            // Revert preset slot to uninstalled (OFF) state
            const item = meta.find(c => c.id === id);
            if (item) {
                item.enabled = false;
                item.installed = false;
            }
        } else {
            meta = meta.filter(c => c.id !== id);
        }
        await this.saveCartridgesMeta(meta);
        await del(`cartridge_db_${id}`);
    }

    async installFolkFriendPreset() {
        const id = 'cartridge_original_folkfriend';
        const url = 'https://folkfriend-app-data.web.app/folkfriend-non-user-data.json';
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch original Irish database (HTTP ${response.status})`);
        }
        const data = await response.json();

        const abcStrings = {};
        for (const settingId in data.settings) {
            abcStrings[settingId] = data.settings[settingId].abc;
            data.settings[settingId].abc = '';
        }

        const tuneCount = Object.keys(data.settings).length;

        const cartridgeData = {
            indexData: data,
            abcStrings: abcStrings
        };

        await set(`cartridge_db_${id}`, cartridgeData);

        const meta = await this.getCartridges();
        const item = meta.find(c => c.id === id);
        if (item) {
            item.tuneCount = tuneCount;
            item.enabled = true;
            item.installed = true;
            item.createdAt = new Date().toISOString();
        } else {
            meta.push({
                id,
                name: 'Original FolkFriend Irish Collection (thesession.org)',
                tuneCount,
                enabled: true,
                installed: true,
                isDefault: false,
                sourceType: 'preset',
                sourceUrl: url,
                createdAt: new Date().toISOString()
            });
        }
        await this.saveCartridgesMeta(meta);
        return item;
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
        const enabledCartridges = meta.filter(c => c.enabled && (c.installed !== false || c.isDefault));

        const mergedSettings = {};
        const mergedAliases = {};
        const mergedAbcStrings = {};

        let cartridgeBaseOffset = 1000000;

        for (const cartridge of enabledCartridges) {
            if (cartridge.id === 'default') {
                if (!defaultTuneIndexData) continue;
                // Merge default database
                const defaultSettings = defaultTuneIndexData.indexData.settings;
                const defaultAliases = defaultTuneIndexData.indexData.aliases;
                const defaultAbc = defaultTuneIndexData.abcStrings;

                for (const settingId in defaultSettings) {
                    const settingObj = defaultSettings[settingId];
                    const sIdStr = String(settingId);
                    const tIdStr = String(settingObj.tune_id || settingId);

                    mergedSettings[sIdStr] = {
                        ...settingObj,
                        tune_id: tIdStr,
                        cartridgeName: cartridge.name,
                        cartridgeId: 'default'
                    };
                    mergedAbcStrings[sIdStr] = defaultAbc[settingId] || '';
                }

                for (const tuneId in defaultAliases) {
                    const tIdStr = String(tuneId);
                    mergedAliases[tIdStr] = defaultAliases[tuneId];
                }
            } else {
                const cartridgeData = await get(`cartridge_db_${cartridge.id}`);
                if (!cartridgeData || !cartridgeData.indexData) continue;

                const cSettings = cartridgeData.indexData.settings;
                const cAliases = cartridgeData.indexData.aliases;
                const cAbc = cartridgeData.abcStrings || {};

                const tuneIdMap = {};
                let settingCounter = 1;

                for (const origSettingId in cSettings) {
                    const settingObj = cSettings[origSettingId];
                    const origTuneId = String(settingObj.tune_id || origSettingId);

                    const parsedOrigTuneId = parseInt(origTuneId, 10);
                    if (!tuneIdMap[origTuneId]) {
                        const numId = !isNaN(parsedOrigTuneId) ? (cartridgeBaseOffset + parsedOrigTuneId) : (cartridgeBaseOffset + settingCounter);
                        tuneIdMap[origTuneId] = String(numId);
                    }

                    const parsedOrigSettingId = parseInt(origSettingId, 10);
                    const numSettingId = !isNaN(parsedOrigSettingId) ? (cartridgeBaseOffset + parsedOrigSettingId) : (cartridgeBaseOffset + settingCounter);
                    const stringSettingId = String(numSettingId);
                    const stringTuneId = tuneIdMap[origTuneId];
                    settingCounter++;

                    mergedSettings[stringSettingId] = {
                        ...settingObj,
                        tune_id: stringTuneId,
                        cartridgeName: cartridge.name,
                        cartridgeId: cartridge.id
                    };
                    mergedAbcStrings[stringSettingId] = cAbc[origSettingId] || '';
                }

                for (const origTuneId in cAliases) {
                    const parsedOrigTuneId = parseInt(origTuneId, 10);
                    const numTuneId = !isNaN(parsedOrigTuneId) ? (cartridgeBaseOffset + parsedOrigTuneId) : (cartridgeBaseOffset + settingCounter++);
                    const stringTuneId = tuneIdMap[origTuneId] || String(numTuneId);
                    mergedAliases[stringTuneId] = cAliases[origTuneId];
                }

                cartridgeBaseOffset += 1000000;
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
