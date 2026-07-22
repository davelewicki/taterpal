<template>
    <div class="search">
        <RecorderButton
            ref="recorderButton"
            class="mx-auto my-xl-5 pt-5"
            @clickFileUpload="$refs.fileUpload.click()"
        />
        <input
            id="audio-upload"
            ref="fileUpload"
            type="file"
            accept="audio/*"
            style="display: none"
            @change="audioFileChanged"
        >

        <v-container>
            <v-row
                wrap
                justify="center"
            >
                <v-col
                    class="mx-5 pt-8 pb-0"
                    sm="6"
                    md="8"
                >
                    <v-text-field
                        v-model="textQuery"
                        label="Search By Tune Name"
                        solo
                        @keypress.enter="nameQuery"
                    >
                        <template #append>
                            <v-icon @click="nameQuery">
                                {{
                                    icons.magnify
                                }}
                            </v-icon>
                        </template>
                    </v-text-field>
                    <p class="text-center caption grey--text text--darken-1">
                        <u>Playing clear individual notes will improve the search!</u>
                        <br>This is an Old Time fork of <a href="https://folkfriend.app" target="_blank" class="grey--text text--darken-1" style="text-decoration: underline;">folkfriend.app</a> that originally audio-searched <a href="https://thesession.org" target="_blank" class="grey--text text--darken-1" style="text-decoration: underline;">thesession.org</a> for Irish tunes.
                        <br><i><b>If Old Time isn't your thing, </b>go to settings and paste an abc file of music that you *do* want to search instead.</i>
                    </p>
                </v-col>
            </v-row>
        </v-container>

        <v-container class="tuneProgress">
            <v-progress-linear
                :class="{ Transparent: indexLoaded }"
                indeterminate
                rounded
            />
        </v-container>

        <v-snackbar
            v-model="snackbar"
            class="text-center"
            :timeout="3000"
        >
            {{ snackbarText }}
        </v-snackbar>

        <!-- Cartridges Section (shown if any custom cartridge is installed) -->
        <v-container v-if="hasCustomCartridges" class="mt-4 px-5 pb-8">
            <v-row justify="center">
                <v-col sm="8" md="8" lg="6">
                    <v-card class="pa-4" outlined>
                        <div class="subtitle-2 font-weight-bold grey--text text--darken-2 mb-2 d-flex align-center">
                            <v-icon left small color="primary">{{ icons.bookMultiple }}</v-icon>
                            Active Search Cartridges
                        </div>
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
                                    <div class="subtitle-2 font-weight-bold">
                                        {{ item.name }}
                                        <v-chip x-small class="ml-2" :color="badgeColor(item.sourceType)" dark>
                                            {{ badgeLabel(item.sourceType) }}
                                        </v-chip>
                                    </div>
                                    <div class="caption text--secondary">
                                        {{ item.tuneCount.toLocaleString() }} tunes
                                    </div>
                                </div>
                            </div>
                        </v-card>
                    </v-card>
                </v-col>
            </v-row>
        <!-- Random Snarch Logo Link (Easter Egg on Search Page) -->
        <a
            v-if="randomSpotStyle"
            href="https://snarch.app"
            target="_blank"
            rel="noopener noreferrer"
            title="Visit Snarch.app"
            class="snarchRandomLogoLink"
            :style="randomSpotStyle"
        >
            <img :src="snarchLogo" alt="Snarch" style="height: 34px; width: auto;" />
        </a>
    </div>
</template>

<script>
import RecorderButton from '@/components/RecorderButton';
import ffBackend from '@/services/backend';
import audioService from '@/services/audio';
import store from '@/services/store';
import { cartridgeStore } from '@/services/cartridgeStore';
import eventBus from '@/eventBus';
import { mdiBookMultiple, mdiMagnify, mdiTimerOutline, mdiTimerOffOutline } from '@mdi/js';

export default {
    name: 'SearchView',
    components: {
        RecorderButton,
    },
    data: function () {
        return {
            snackbar: null,
            snackbarText: null,

            textQuery: '',
            offlineButton: true,
            indexLoaded: store.state.indexLoaded,
            cartridges: [],

            snarchLogo: require('@/assets/snarch_logo.png'),
            randomSpotIndex: 0,
            spotStyles: [
                { top: '70px', left: '16px', position: 'fixed', zIndex: 10 },
                { top: '70px', right: '16px', position: 'fixed', zIndex: 10 },
                { bottom: '24px', left: '16px', position: 'fixed', zIndex: 10 },
                { bottom: '24px', right: '16px', position: 'fixed', zIndex: 10 },
                { top: '48%', left: '12px', position: 'fixed', zIndex: 10 },
                { top: '48%', right: '12px', position: 'fixed', zIndex: 10 },
            ],

            icons: {
                bookMultiple: mdiBookMultiple,
                magnify: mdiMagnify,
                timerOutline: mdiTimerOutline,
                timerOffOutline: mdiTimerOffOutline,
            },
        };
    },
    computed: {
        hasCustomCartridges() {
            return this.cartridges.some(c => !c.isDefault);
        },
        randomSpotStyle() {
            return this.spotStyles[this.randomSpotIndex] || this.spotStyles[0];
        }
    },
    created: function () {
        this.randomizeSnarchSpot();

        eventBus.$emit('parentViewActivated');

        eventBus.$on('parentViewActivated', () => {
            this.randomizeSnarchSpot();
        });

        if(!this.indexLoaded) {
            eventBus.$on('indexLoaded', () => {
                this.indexLoaded = true;
            });
        }

        eventBus.$on('searchError', (errorMsg) => {
            this.snackbar = true;
            this.snackbarText = errorMsg || 'An error ocurred 😟';
        });

        this.loadCartridges();
    },
    methods: {
        randomizeSnarchSpot() {
            this.randomSpotIndex = Math.floor(Math.random() * this.spotStyles.length);
        },
        async loadCartridges() {
            this.cartridges = await cartridgeStore.getCartridges();
        },
        badgeColor(sourceType) {
            switch (sourceType) {
                case 'built-in': return 'primary';
                case 'abc_text': return 'teal';
                case 'abc_url': return 'deep-purple';
                case 'snarch_url': return 'amber darken-2';
                default: return 'grey';
            }
        },
        badgeLabel(sourceType) {
            switch (sourceType) {
                case 'built-in': return 'Built-in';
                case 'abc_text': return 'Pasted ABC';
                case 'abc_url': return 'ABC URL';
                case 'snarch_url': return 'Snarch Book';
                default: return 'Custom';
            }
        },
        async toggleCartridge(item) {
            await cartridgeStore.toggleCartridge(item.id, item.enabled);
            await ffBackend.reloadActiveCartridges();
            await this.loadCartridges();
        },
        nameQuery() {
            if(this.textQuery.length < 2) {
                this.snackbar = true;
                this.snackbarText = 'Search query too short';
                return;
            }

            ffBackend.runNameQuery(this.textQuery).then((results) => {
                store.state.lastResults = results;
                this.$router.push({ name: 'results' });
                eventBus.$emit('childViewActivated');
            });
        },
        placeholderMethod() {
            console.debug('placeholder action');
        },
        advancedMode(mode) {
            store.userSettings.advancedMode = mode;
        },
        async audioFileChanged(e) {
            try {
                store.setSearchState(store.searchStates.WORKING);
    
                console.time('file-upload');
                const file = e.target.files[0];
                const url = URL.createObjectURL(file);
                const audioData = await audioService.urlToTimeDomainData(url);
                console.timeEnd('file-upload');
                
                console.time('feed-pcm-signal');
                await ffBackend.feedEntirePCMSignal(audioData);
                console.timeEnd('feed-pcm-signal');
                
                await ffBackend.submitFilledBuffer();
            } catch(e) {
                console.error(e);
            } finally {
                store.setSearchState(store.searchStates.READY);
            }
        },
    },
};
</script>

<style scoped>
.tuneProgress {
    max-width: 50%;
    opacity: 1;
}

.Transparent {
    opacity: 0;
}

.noFlexGrow {
    flex-grow: 0;
}

.snarchRandomLogoLink {
    transition: transform 0.25s ease-in-out, opacity 0.25s ease-in-out;
    opacity: 0.85;
}

.snarchRandomLogoLink:hover {
    transform: scale(1.2);
    opacity: 1.0;
}
</style>
