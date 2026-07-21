<template>
    <v-container v-if="name" class="viewContainerWrapper">
        <div class="d-flex align-center justify-space-between my-2">
            <h1 class="mb-0 mt-0">
                {{ name }}
            </h1>
            <v-btn
                v-if="sourceUrl"
                color="primary"
                outlined
                small
                :href="sourceUrl"
                target="_blank"
                rel="noopener noreferrer"
            >
                Source
                <v-icon right small class="ml-1">{{ icons.openInNew }}</v-icon>
            </v-btn>
        </div>

        <v-container v-if="displayableAliases.length" class="mt-0 mb-2 py-0">
            <span class="akaSpan pl-2 pr-1">Also known as</span>
            <v-chip v-for="alias in displayableAliases" :key="alias" class="ma-1 px-2" small>
                {{ alias }}
            </v-chip>
        </v-container>

        <v-expansion-panels ref="expansionPanels" v-model="expandedIndex" :class="{ abcFullScreen: abcFullScreen }"
            multiple>
            <v-expansion-panel v-for="settingData in settings" :key="settingData.setting_id" class="expansionPanel"
                :setting="settingData">
                <v-expansion-panel-header>
                    <h3 class="descriptor font-weight-medium">
                        {{
                            `${settingData.dance} in ${settingData.mode.slice(
                                0,
                                4
                            )}`
                        }}
                    </h3>
                    <v-icon v-if="settingData.hasChords" class="justify-end tabChordIcon">
                        $vuetify.icons.tabChord
                    </v-icon>
                </v-expansion-panel-header>
                <v-expansion-panel-content>
                    <AbcDisplay :abc="settingData.abc" :mode="settingData.mode" :meter="settingData.meter"
                        @abcGoFullScreen="abcGoFullScreen" @abcExitFullScreen="abcExitFullScreen"
                        @abcRendered="scrollIntoView" />
                </v-expansion-panel-content>
            </v-expansion-panel>
        </v-expansion-panels>
    </v-container>
    <!-- This actually shouldn't ever happen unless the user manually navigates to /tunes -->
    <v-container v-else-if="!tuneID">
        <p class="px-10">
            No tune loaded. Please search for a tune.
        </p>
    </v-container>
</template>

<script>
import utils from '@/js/utils.js';
import AbcDisplay from '@/components/AbcDisplay';
import ffBackend from '@/services/backend.js';
import eventBus from '@/eventBus';

import {
    mdiOpenInNew,
} from '@mdi/js';
export default {
    name: 'TuneView',
    components: { AbcDisplay },
    props: {
        tuneID: {
            type: String,
            required: false,
            default: ''
        },
        displayName: {
            type: String,
            required: false,
            default: ''
        },
        settingID: {
            type: String,
            required: false,
            default: null
        },
    },
    data: function () {
        return {
            settings: null,
            name: null,
            displayableAliases: [],
            abcFullScreen: false,

            expandedIndex: [],

            icons: {
                openInNew: mdiOpenInNew,

            },
            sourceUrl: `https://thesession.org/tunes/${this.tuneID}`
        };
    },
    created: async function () {
        eventBus.$emit('childViewActivated');

        if (this.tuneID === '') {
            return;
        }

        this.settings = await ffBackend.settingsFromTuneID(this.tuneID);

        // Check if any setting contains a line starting with F: followed by a valid URL
        for (const setting of this.settings) {
            if (setting.abc) {
                const match = setting.abc.match(/^\s*F:\s*(https?:\/\/[^\s]+)/m);
                if (match) {
                    this.sourceUrl = match[1].trim();
                    break;
                }
            }
        }

        let aliases = await ffBackend.aliasesFromTuneID(this.tuneID);

        // Expand this.settings with chords where relevant
        // TODO move this function about and actually write it properly
        // This might do:
        // "[ABCDEFG]b?#?m?(in|aj)?7?(dim)?(\/[ABCDEFG]b?#?m?(in|aj)?7?(dim)?)?"
        this.settings = this.settings.map((settingData) => {
            settingData.hasChords = (Math.random() > 0.5);
            return settingData;
        })

        let primaryAliasIndex = 0;

        if (typeof this.displayName !== 'undefined') {
            primaryAliasIndex = aliases.indexOf(this.displayName);
            if (primaryAliasIndex == -1) {
                console.warn('Display name was not found in aliases!');
                primaryAliasIndex = 0;
            }
        }

        this.displayableAliases = aliases.map((a) =>
            utils.parseDisplayableName(a)
        );
        this.name = this.displayableAliases.splice(primaryAliasIndex, 1)[0];

        console.log(this.settings);

        // Auto-pop open the matched setting and scroll into view
        if (this.settingID) {
            for (const [i, setting] of this.settings.entries()) {
                if (setting.setting_id === this.settingID) {
                    this.expandedIndex = [i];
                }
            }
        } else {
            // By default, open the first tune. Only pop it open
            //  here because otherwise if it's in data() the first
            //  one pops open unwanted even when we've hit another
            //  as above.
            this.expandedIndex = [0];
        }
    },
    beforeRouteLeave: function (to, from, next) {
        eventBus.$emit('stopSynthPlayback');
        next();
    },
    methods: {
        descriptor: function (setting) {
            return utils.parseDisplayableDescription(setting);
        },
        abcGoFullScreen: function () {
            this.abcFullScreen = true;
        },
        abcExitFullScreen: function () {
            this.abcFullScreen = false;
        },
        scrollIntoView: function () {
            // If it's a couple of tunes down then help the user by scrolling
            //  the setting into view.
            let expandedIndex = this.expandedIndex[0];
            if (expandedIndex && expandedIndex >= 3) {
                let panels = this.$refs.expansionPanels;
                panels.$children[expandedIndex].$el.scrollIntoView();
            }
        }
    },
};
</script>

<style scoped>
.descriptor::first-letter {
    text-transform: uppercase;
    display: inline-block;
}

.abcFullScreen {
    z-index: 8;
}

h1 {
    font-size: x-large;
}

.expansionPanel {
    scroll-margin-top: 60px;
}

.sourceChip {
    font-style: italic;
}

.akaSpan {
    font-size: smaller;
    font-style: italic;
}
</style>