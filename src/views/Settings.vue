<template>
    <v-container 
        class="viewContainerWrapper"
    >
        <v-card
            class="pa-5 my-2"
        >
            <h1 class="pb-3">
                Settings
            </h1>
            <v-row>
                <v-switch
                    v-model="userSettings.preferFileUpload"
                    inset
                    label="Upload file instead of using device microphone"
                    class="my-0 pl-2"
                    @change="settingsChanged"
                />
            </v-row>
            <v-row>
                <v-switch
                    v-model="userSettings.advancedMode"
                    inset
                    label="Removes time limit on microphone and generates sheet music without searching database"
                    class="my-0 pl-2"
                    @change="settingsChanged"
                />
            </v-row>
            <v-row>
                <v-switch
                    v-model="userSettings.showAbcText"
                    inset
                    label="Show ABC as text alongside sheet music"
                    class="my-0 pl-2"
                    @change="settingsChanged"
                />
            </v-row>
        </v-card>
        <v-card class="pa-5 my-3">
            <h1 class="pb-2">
                <v-icon class="mr-2 pb-1" color="primary">{{ icons.bookMultiple }}</v-icon>
                Search Index Cartridges
            </h1>
            <p class="subtitle-2 text--secondary mb-4">
                Manage which book indices are active for audio search matching. You can import custom ABC files, external ABC URLs, or Snarch books as local cartridges.
            </p>

            <!-- Cartridges List -->
            <v-list two-line subheader class="mb-4">
                <v-subheader class="px-0 font-weight-bold">CARTRIDGES ({{ installedCount }} INSTALLED)</v-subheader>
                <v-card 
                    v-for="item in cartridges" 
                    :key="item.id" 
                    outlined 
                    class="mb-2 pa-2"
                    :style="item.enabled ? 'border-left: 4px solid #055581;' : 'border-left: 4px solid #B0BEC5; opacity: 0.7;'"
                >
                    <div class="d-flex align-center">
                        <v-switch
                            v-model="item.enabled"
                            inset
                            hide-details
                            class="ma-0 pa-0 ml-2"
                            @change="toggleCartridge(item)"
                        />
                        <div class="ml-3 flex-grow-1">
                            <div class="subtitle-1 font-weight-bold">
                                {{ item.name }}
                                <v-chip x-small class="ml-2" :color="badgeColor(item.sourceType)" dark>
                                    {{ badgeLabel(item.sourceType) }}
                                </v-chip>
                            </div>
                            <div class="caption text--secondary">
                                <template v-if="item.id === 'cartridge_original_folkfriend' && !item.installed">
                                    <span class="teal--text text--darken-2 font-weight-medium">~30,000 tunes • Not installed (flip switch to download & activate)</span>
                                </template>
                                <template v-else>
                                    {{ item.tuneCount.toLocaleString() }} tunes
                                    <span v-if="item.createdAt"> • Added {{ formatDate(item.createdAt) }}</span>
                                </template>
                            </div>
                        </div>
                        <v-btn 
                            v-if="!item.isDefault && (item.installed !== false)" 
                            icon 
                            color="error" 
                            @click="confirmDelete(item)"
                            :title="item.id === 'cartridge_original_folkfriend' ? 'Uninstall Irish Collection' : 'Delete Cartridge'"
                        >
                            <v-icon>{{ icons.delete }}</v-icon>
                        </v-btn>
                    </div>
                </v-card>
            </v-list>

            <v-divider class="my-4" />

            <!-- Import New Cartridge Section -->
            <h2 class="subtitle-1 font-weight-bold mb-2">
                <v-icon class="mr-1 pb-1" color="primary">{{ icons.plus }}</v-icon>
                Add New Cartridge
            </h2>

            <v-tabs v-model="importTab" color="primary" class="mb-3">
                <v-tab key="text">
                    <v-icon left small>{{ icons.fileEdit }}</v-icon> Paste ABC
                </v-tab>
                <v-tab key="url">
                    <v-icon left small>{{ icons.link }}</v-icon> ABC URL
                </v-tab>
                <v-tab key="snarch" class="d-flex align-center">
                    <a 
                        href="https://snarch.app" 
                        target="_blank" 
                        rel="noopener noreferrer" 
                        class="d-inline-flex align-center mr-1 text-decoration-none"
                        title="Visit Snarch.app"
                        @click.stop
                    >
                        <img :src="snarchLogo" alt="Snarch" style="height: 22px; width: auto;" class="mr-1" />
                    </a>
                    Snarch Book
                </v-tab>
            </v-tabs>

            <v-tabs-items v-model="importTab">
                <!-- Tab 1: Paste ABC Text -->
                <v-tab-item key="text" class="pt-2">
                    <v-text-field
                        v-model="abcForm.name"
                        label="Book Name"
                        placeholder="e.g. Roche Harbor Jam Session"
                        outlined
                        dense
                    />
                    <v-textarea
                        v-model="abcForm.text"
                        label="ABC Notation Text"
                        placeholder="Paste raw ABC tunes here (X:1, T:Tune Title, K:G...)"
                        rows="5"
                        outlined
                        dense
                    />
                    <v-btn
                        color="primary"
                        :loading="loading"
                        :disabled="!abcForm.text.trim()"
                        @click="importAbcText"
                    >
                        <v-icon left>{{ icons.plus }}</v-icon> Compile & Install Cartridge
                    </v-btn>
                </v-tab-item>

                <!-- Tab 2: ABC URL -->
                <v-tab-item key="url" class="pt-2">
                    <v-text-field
                        v-model="urlForm.name"
                        label="Book Name (Optional)"
                        placeholder="e.g. Old Time Archive"
                        outlined
                        dense
                    />
                    <v-text-field
                        v-model="urlForm.url"
                        label="ABC File URL"
                        placeholder="https://example.com/tunes.abc"
                        outlined
                        dense
                    />
                    <v-btn
                        color="primary"
                        :loading="loading"
                        :disabled="!urlForm.url.trim()"
                        @click="importAbcUrl"
                    >
                        <v-icon left>{{ icons.cloudDownload }}</v-icon> Fetch & Install Cartridge
                    </v-btn>
                </v-tab-item>

                <!-- Tab 3: Snarch Book URL -->
                <v-tab-item key="snarch" class="pt-2">
                    <v-text-field
                        v-model="snarchForm.url"
                        label="Snarch Book URL or ID"
                        placeholder="https://snarch.app/book/RocheHarbor2020 or book ID"
                        outlined
                        dense
                    />
                    <div class="d-flex align-center flex-wrap">
                        <v-btn
                            color="primary"
                            :loading="loading"
                            :disabled="!snarchForm.url.trim()"
                            @click="importSnarchBook"
                            class="mr-2 mb-2"
                        >
                            <v-icon left>{{ icons.cloudDownload }}</v-icon> Fetch & Install Snarch Book
                        </v-btn>
                        <v-btn
                            href="https://snarch.app"
                            target="_blank"
                            rel="noopener noreferrer"
                            outlined
                            color="primary"
                            class="mb-2"
                        >
                            <img :src="snarchLogo" alt="Snarch" style="height: 18px; width: auto;" class="mr-2" />
                            Open Snarch.app
                            <v-icon right small>{{ icons.openInNew }}</v-icon>
                        </v-btn>
                    </div>
                </v-tab-item>
            </v-tabs-items>

            <!-- Status Alert Messages -->
            <v-alert
                v-if="statusMessage"
                :type="statusType"
                dismissible
                class="mt-4 mb-0"
                @dismissed="statusMessage = ''"
            >
                {{ statusMessage }}
            </v-alert>
        </v-card>

        <v-card
            class="pa-5 my-2"
        >
            <h1>Download</h1>
            <p>
                FolkFriend is a "Web App", which means it installs onto your
                Home Screen just like any other app.
            </p>
            <p
                v-if="isPWA"
                align="center"
            >
                FolkFriend is installed <v-icon class="pb-1 Installed">
                    {{ icons.checkCircle }}
                </v-icon>
            </p>
            <p v-else-if="ua.isSafari && ua.isMobile">
                On iOS Safari,
                <ul>
                    <li>
                        Tap <v-icon class="pb-2">
                            {{ icons.iosShare }}
                        </v-icon> "share"
                    </li>
                    <li>Scroll down</li>
                    <li>
                        Tap <v-icon class="pb-1">
                            {{ icons.iosAddToHomeScreen }}
                        </v-icon> "add to home screen"
                    </li>
                </ul>
            </p>
            <p v-else-if="ua.isChrome && ua.isMobile">
                On Chrome mobile,
                <ul>
                    <li>
                        Tap <v-icon class="pb-1">
                            {{ icons.dotsVertical }}
                        </v-icon> "Customise"
                    </li>
                    <li>
                        Tap <v-icon class="pb-1">
                            {{ icons.installMobile }}
                        </v-icon> "Install FolkFriend"
                    </li>
                </ul>
            </p>
            <p v-else-if="ua.isChrome && !ua.isMobile">
                On Chrome desktop,
                <ul>
                    <li>
                        Tap <v-icon class="pb-1">
                            {{ icons.installDesktop }}
                        </v-icon> "install app"
                    </li>
                </ul>
            </p>
            <p v-else>
                To install FolkFriend, navigate to the settings of your browser
                and select "Add to Home Screen" or "Install App".
            </p>
        </v-card>

        <!-- Delete Confirmation Dialog -->
        <v-dialog v-model="deleteDialog" max-width="400">
            <v-card v-if="cartridgeToDelete">
                <v-card-title class="headline">Delete Cartridge?</v-card-title>
                <v-card-text>
                    Are you sure you want to remove <strong>{{ cartridgeToDelete.name }}</strong>? This will remove its tunes from your search index.
                </v-card-text>
                <v-card-actions>
                    <v-spacer />
                    <v-btn text @click="deleteDialog = false">Cancel</v-btn>
                    <v-btn color="error" text @click="deleteCartridge">Delete</v-btn>
                </v-card-actions>
            </v-card>
        </v-dialog>
    </v-container>
</template>

<script>
import store from '@/services/store.js';
import ffBackend from '@/services/backend.js';
import { cartridgeStore } from '@/services/cartridgeStore.js';
import eventBus from '@/eventBus';
import utils from '@/js/utils.js';
import {
    mdiBookMultiple,
    mdiCellphoneArrowDown,
    mdiCheckCircleOutline,
    mdiCloudDownload,
    mdiDelete,
    mdiDotsVertical,
    mdiExportVariant,
    mdiFileDocumentEditOutline,
    mdiLinkVariant,
    mdiMusicBox,
    mdiOpenInNew,
    mdiPlus,
    mdiPlusBoxOutline,
} from '@mdi/js';

export default {
    name: 'SettingsView',
    beforeRouteEnter(_, from, next) {
        if(from.name !== 'search') {
            eventBus.$emit('parentViewActivated');
        }        
        next();
    },
    data: () => ({
        snarchLogo: require('@/assets/snarch_logo.png'),
        icons: {
            bookMultiple: mdiBookMultiple,
            cloudDownload: mdiCloudDownload,
            delete: mdiDelete,
            fileEdit: mdiFileDocumentEditOutline,
            link: mdiLinkVariant,
            musicBox: mdiMusicBox,
            openInNew: mdiOpenInNew,
            plus: mdiPlus,
            iosShare: mdiExportVariant,
            iosAddToHomeScreen: mdiPlusBoxOutline,
            checkCircle: mdiCheckCircleOutline,
            installDesktop: mdiCellphoneArrowDown,
            installMobile: mdiCellphoneArrowDown,
            dotsVertical: mdiDotsVertical,
        },
        settingsLoaded: false,
        userSettings: store.userSettings,
        isPWA: utils.checkStandalone(),

        // Cartridge management state
        cartridges: [],
        importTab: 0,
        loading: false,
        statusMessage: '',
        statusType: 'success',

        abcForm: {
            name: '',
            text: ''
        },
        urlForm: {
            name: '',
            url: ''
        },
        snarchForm: {
            url: ''
        },

        deleteDialog: false,
        cartridgeToDelete: null
    }),
    computed: {
        installedCount() {
            return this.cartridges.filter(c => c.installed !== false).length;
        }
    },
    created: function() {
        this.ua = utils.checkUserAgent();
        this.loadCartridges();
    },
    methods: {
        settingsChanged() {
            store.updateUserSettings(this.userSettings);
        },
        async loadCartridges() {
            this.cartridges = await cartridgeStore.getCartridges();
        },
        badgeColor(sourceType) {
            switch (sourceType) {
                case 'built-in': return 'primary';
                case 'preset': return 'teal darken-1';
                case 'abc_text': return 'teal';
                case 'abc_url': return 'deep-purple';
                case 'snarch_url': return 'amber darken-2';
                default: return 'grey';
            }
        },
        badgeLabel(sourceType) {
            switch (sourceType) {
                case 'built-in': return 'Built-in';
                case 'preset': return 'TheSession Irish';
                case 'abc_text': return 'Pasted ABC';
                case 'abc_url': return 'ABC URL';
                case 'snarch_url': return 'Snarch Book';
                default: return 'Custom';
            }
        },
        async installFolkFriendPreset() {
            this.loading = true;
            this.statusMessage = '';
            try {
                const cartridge = await cartridgeStore.addPresetFolkFriendCartridge();
                await ffBackend.reloadActiveCartridges();
                await this.loadCartridges();
                this.statusType = 'success';
                this.statusMessage = `Successfully installed "${cartridge.name}" (${cartridge.tuneCount.toLocaleString()} tunes)!`;
            } catch (err) {
                this.statusType = 'error';
                this.statusMessage = err.message || 'Failed to install Irish database preset.';
            } finally {
                this.loading = false;
            }
        },
        formatDate(isoStr) {
            if (!isoStr) return '';
            try {
                return new Date(isoStr).toLocaleDateString();
            } catch (e) {
                return '';
            }
        },
        async toggleCartridge(item) {
            await cartridgeStore.toggleCartridge(item.id, item.enabled);
            await ffBackend.reloadActiveCartridges();
            await this.loadCartridges();
        },
        confirmDelete(item) {
            this.cartridgeToDelete = item;
            this.deleteDialog = true;
        },
        async deleteCartridge() {
            if (!this.cartridgeToDelete) return;
            const deletedName = this.cartridgeToDelete.name;
            await cartridgeStore.deleteCartridge(this.cartridgeToDelete.id);
            this.deleteDialog = false;
            this.cartridgeToDelete = null;
            await this.loadCartridges();
            await ffBackend.reloadActiveCartridges();
            this.showStatus(`Deleted cartridge "${deletedName}".`, 'success');
        },
        showStatus(msg, type = 'success') {
            this.statusMessage = msg;
            this.statusType = type;
        },
        async importAbcText() {
            this.loading = true;
            this.statusMessage = '';
            try {
                const cartridge = await cartridgeStore.addCartridgeFromAbcText(
                    this.abcForm.name,
                    this.abcForm.text
                );
                await this.loadCartridges();
                await ffBackend.reloadActiveCartridges();
                this.showStatus(`Successfully compiled & installed "${cartridge.name}" with ${cartridge.tuneCount} tunes!`, 'success');
                this.abcForm.name = '';
                this.abcForm.text = '';
            } catch (e) {
                this.showStatus(e.message || 'Failed to parse ABC notation.', 'error');
            } finally {
                this.loading = false;
            }
        },
        async importAbcUrl() {
            this.loading = true;
            this.statusMessage = '';
            try {
                const cartridge = await cartridgeStore.addCartridgeFromAbcUrl(
                    this.urlForm.url,
                    this.urlForm.name
                );
                await this.loadCartridges();
                await ffBackend.reloadActiveCartridges();
                this.showStatus(`Successfully fetched & installed "${cartridge.name}" with ${cartridge.tuneCount} tunes!`, 'success');
                this.urlForm.name = '';
                this.urlForm.url = '';
            } catch (e) {
                this.showStatus(e.message || 'Failed to download or parse ABC file from URL.', 'error');
            } finally {
                this.loading = false;
            }
        },
        async importSnarchBook() {
            this.loading = true;
            this.statusMessage = '';
            try {
                const cartridge = await cartridgeStore.addCartridgeFromSnarchUrl(
                    this.snarchForm.url
                );
                await this.loadCartridges();
                await ffBackend.reloadActiveCartridges();
                this.showStatus(`Successfully fetched & installed Snarch book "${cartridge.name}" with ${cartridge.tuneCount} tunes!`, 'success');
                this.snarchForm.url = '';
            } catch (e) {
                this.showStatus(e.message || 'Failed to fetch Snarch book.', 'error');
            } finally {
                this.loading = false;
            }
        }
    },
};
</script>

<style scoped>
</style>

<style scoped>
</style>