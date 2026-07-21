<template>
    <a
        :href="shouldInterceptClick ? sourceUrl : localHref"
        :target="shouldInterceptClick ? '_blank' : undefined"
        @click="rowClicked"
        class="resultRowLink"
    >
        <v-container
            v-ripple
            class="px-4 py-2"
        >
            <div class="d-flex align-center">
                <!-- Left: Play/Stop Button + Label -->
                <div class="d-flex flex-column align-center mr-4" style="min-width: 64px;">
                    <v-btn
                        icon
                        large
                        color="primary"
                        class="ma-0"
                        @click.prevent.stop="playStopPressed"
                    >
                        <v-icon large>
                            {{ isPlaying ? icons.stop : icons.play }}
                        </v-icon>
                    </v-btn>
                    <span class="primary--text text-caption font-weight-medium mt-n1" style="text-transform: uppercase; font-size: 0.7; letter-spacing: 0.05em;">
                        {{ isPlaying ? 'stop' : 'play' }}
                    </span>
                </div>

                <!-- Right: Title, Descriptor, Score -->
                <div class="flex-grow-1">
                    <v-row class="pt-1 pb-0">
                        <v-col class="py-0">
                            <h2 class="mb-0 text-left">{{ name }}</h2>
                        </v-col>
                    </v-row>
                    <v-row class="pb-1 pt-0">
                        <v-col class="py-0 text-left descriptor">
                            {{ descriptor }}
                            <!-- Source Domain Subtext -->
                            <span v-if="sourceDomain" class="grey--text text--darken-1 ml-2 font-weight-light" style="font-size: 0.85em;">
                                ({{ sourceDomain }})
                            </span>
                        </v-col>
                        <v-col
                            v-show="score !== null"
                            class="py-0 text-right score"
                            :style="`color: ${scoreColour};`"
                        >
                            {{ scoreLabel }}
                        </v-col>
                    </v-row>
                </div>
            </div>
        </v-container>
    </a>
</template>

<script>
import utils from '@/js/utils.js';
import store from '@/services/store.js';
import {HistoryItem} from '@/js/schema';
import ABCJS from 'abcjs';
import eventBus from '@/eventBus';
import { mdiPlay, mdiStop } from '@mdi/js';

export default {
    name: 'ResultRow',
    props: {
        setting: {
            type: Object,
            required: true
        },
        displayName: {
            type: String,
            required: true
        },
        settingID: {
            type: String,
            default: null,
            required: false
        },
        score: {
            type: Number,
            default: null,
            required: false
        }
    },

    data: function () {
        return {
            isPlaying: false,
            midiBuffer: null,
            icons: {
                play: mdiPlay,
                stop: mdiStop,
            }
        };
    },

    computed: {
        effectiveSettingID: function () {
            return this.settingID || this.setting.tune_id;
        },
        descriptor: function () {
            return utils.parseDisplayableDescription(this.setting);
        },
        name: function () {
            return utils.parseDisplayableName(this.displayName);
        },
        scoreLabel: function () {
            if (this.score > 0.65) {
                return 'Very Close';
            } else if (this.score > 0.5) {
                return 'Close';
            } else if (this.score > 0.2) {
                return 'Possible';
            } else if (this.score > 0) {
                return 'Unlikely';
            } else {
                return 'No Match';
            }
        },
        scoreColour: function () {
            let x = this.score;
            x = Math.min(0.7, x);
            x = Math.max(0.0, x);
            x = x / 0.7;

            const a = '#CC1111';
            const b = '#11CC11';
            return utils.lerpColor(a, b, x);
        },
        abcText: function () {
            const abcLines = [];
            if (this.setting.mode) {
                abcLines.push(`K:${this.setting.mode}`);
            }
            if (this.setting.meter) {
                abcLines.push(`M:${this.setting.meter}`);
            }
            abcLines.push(this.setting.abc);
            const rawText = abcLines.join('\n');
            const lines = rawText.split('\n');
            const kIndex = lines.findIndex(line => line.trim().startsWith('K:'));
            if (kIndex !== -1) {
                lines.splice(kIndex + 1, 0, '%%MIDI gchordoff', '%%MIDI accompanimentvol 0');
            } else {
                lines.unshift('%%MIDI gchordoff', '%%MIDI accompanimentvol 0');
            }
            return lines.join('\n');
        },
        sourceUrl: function () {
            if (!this.setting.abc) return null;
            const match = this.setting.abc.match(/^\s*F:\s*(https?:\/\/[^\s]+)/m);
            return match ? match[1].trim() : null;
        },
        sourceDomain: function () {
            const url = this.sourceUrl;
            if (!url) return null;
            try {
                const parsed = new URL(url);
                return parsed.hostname.replace(/^www\./i, '');
            } catch (e) {
                return null;
            }
        },
        shouldInterceptClick: function () {
            const domain = this.sourceDomain;
            if (!domain) return false;
            return domain.includes('taterjoes') || domain.includes('oldtimefiddletunes');
        },
        localHref: function () {
            return this.$router.resolve({
                name: 'tune',
                params: {
                    settingID: this.effectiveSettingID,
                    tuneID: this.setting.tune_id,
                    displayName: this.displayName,
                },
            }).href;
        }
    },

    created: function () {
        eventBus.$on('stopSynthPlayback', this.handleGlobalStop);
    },

    beforeDestroy: function () {
        eventBus.$off('stopSynthPlayback', this.handleGlobalStop);
        this.stopPlayback();
    },

    methods: {
        addToHistory() {
            store.addToHistory(new HistoryItem({
                settingID: this.effectiveSettingID,
                setting: this.setting,
                displayName: this.displayName,
            }));
        },
        rowClicked(event) {
            if (this.shouldInterceptClick) {
                // Let browser handle native click on target="_blank" href for security policies (User Activation)
                // to ensure Chrome processes and highlights scroll-to-text fragments (#:~:text=)
                this.addToHistory();
            } else {
                event.preventDefault();
                event.stopPropagation();
                this.$router.push({
                    name: 'tune',
                    params: {
                        settingID: this.effectiveSettingID,
                        tuneID: this.setting.tune_id,
                        displayName: this.displayName,
                    }
                });
                this.addToHistory();
            }
        },
        playStopPressed() {
            if (this.isPlaying) {
                this.stopPlayback();
            } else {
                this.startPlayback();
            }
        },
        handleGlobalStop(initiatorId) {
            if (initiatorId !== this.effectiveSettingID) {
                this.stopPlayback();
            }
        },
        startPlayback() {
            // Stop any currently playing audio across the app
            eventBus.$emit('stopSynthPlayback', this.effectiveSettingID);

            this.isPlaying = true;

            if (!ABCJS.synth.supportsAudio()) {
                console.error("ABCJS doesn't support audio synth");
                this.isPlaying = false;
                return;
            }

            // Create AudioContext inside click context
            window.AudioContext = window.AudioContext ||
                            window.webkitAudioContext ||
                            navigator.mozAudioContext ||
                            navigator.msAudioContext;

            const audioContext = new window.AudioContext();

            audioContext.resume().then(() => {
                try {
                    console.log('[TaterPal] Rendering ABC for setting:', this.effectiveSettingID);
                    console.log('[TaterPal] Final ABC text being sent to player:\n' + this.abcText);
                    const abcVisual = ABCJS.parseOnly(this.abcText)[0];
                    console.log('[TaterPal] Rendered visual object:', abcVisual);

                    this.midiBuffer = new ABCJS.synth.CreateSynth();

                    const hasTempo = /^\s*Q:\s*/m.test(this.abcText);
                    const millisecondsPerMeasure = (abcVisual && typeof abcVisual.millisecondsPerMeasure === 'function')
                        ? (hasTempo ? abcVisual.millisecondsPerMeasure() : abcVisual.millisecondsPerMeasure() * 2.0)
                        : (hasTempo ? 2000 : 4000);

                    return this.midiBuffer.init({
                        visualObj: abcVisual,
                        audioContext: audioContext,
                        millisecondsPerMeasure: millisecondsPerMeasure,
                        options: {
                            chordsOff: true,
                            bassOff: true
                        }
                    }).then(() => {
                        console.log('[TaterPal] Synth initialized. Priming...');
                        return this.midiBuffer.prime();
                    }).then(() => {
                        console.log('[TaterPal] Synth primed. Playing...');
                        if (!this.isPlaying) {
                            this.stopPlayback();
                            return;
                        }
                        this.midiBuffer.start();
                        this.midiBuffer.onEnded = () => {
                            this.stopPlayback();
                        };
                    }).catch(error => {
                        console.error("[TaterPal] AudioContext play error:", error);
                        this.stopPlayback();
                    });
                } catch (e) {
                    console.error("[TaterPal] ABCJS render/synth setup error:", e);
                    this.stopPlayback();
                }
            }).catch(err => {
                console.error("[TaterPal] AudioContext resume error:", err);
                this.stopPlayback();
            });
        },
        stopPlayback() {
            this.isPlaying = false;
            if (this.midiBuffer) {
                try {
                    this.midiBuffer.stop();
                } catch (e) {}
                this.midiBuffer = null;
            }
        }
    },
};
</script>

<style scoped>
.descriptor {
  font-style: italic;
}

.descriptor::first-letter {
  text-transform: uppercase;
}

.score {
  font-weight: bolder;
  font-style: italic;
}

.resultsTable a {
  text-decoration: none;
  color: inherit;
}

.resultsTable a div {
  background: inherit;
}
</style>