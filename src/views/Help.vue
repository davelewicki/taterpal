<template>
    <v-container 
        class="viewContainerWrapper"
    >

        <v-card class="pa-5 my-2">
            <h1>About</h1>
            <p>
                TaterPal listens to instrumental folk music, transcribes the
                melody to sheet music, and searches a database of traditional
                tunes for matches. You may either use the microphone on your
                device, or upload an existing audio file. TaterPal runs
                entirely in browser and works without an internet connection.
            </p>

               <v-img
                            src="@/assets/logo.svg"
                            max-height="75%"
                            max-width="50%"
                            class="mx-auto MainLogo"
                            align-left
                            left
                            contain
                        />
            <p>
                TaterPal is based entirely on the original FolkFriend app that
                can be found at <a href=https://folkfriend.app>folkfriend.app</a>.
                Folkfriend is opensource and the source for the TaterPal fork can be found at
                👉 <a href=https://github.com/davelewicki/taterpal>github.com/davelewicki/taterpal</a>
            </p>
            <p>
                I've purposfully left the donor link to FolkFriend in the main menu
                and encourage you to buy him a beer by visiting his <a href=https://donorbox.org/help-support-development-of-folkfriend>donor page</a>.
            </p>
        </v-card>
        <v-card
            class="pa-5 my-2"
        >
            <h1>Share</h1>
            <p>Scan the QR code on another device to open FolkFriend.</p>
            <v-img
                src="@/assets/qr-code.svg"
                class="mx-auto QRCode"
                align-center
                center
                contain
            />
        </v-card>

    </v-container>
</template>

<script>
import store from '@/services/store.js';
import ffConfig from '@/ffConfig.js';
import eventBus from '@/eventBus';
import utils from '@/js/utils.js';

import {
    mdiAlertCircle,
    mdiCellphoneArrowDown,
    mdiCheckCircleOutline,
    mdiDotsVertical,
    mdiExportVariant,
    mdiPlusBoxOutline,
} from '@mdi/js';

export default {
    name: 'HelpView',
    data: () => ({
        icons: {
            alertCircle: mdiAlertCircle,
            iosShare: mdiExportVariant,
            iosAddToHomeScreen: mdiPlusBoxOutline,
            checkCircle: mdiCheckCircleOutline,
            // TODO these haven't been added yet
            // mdiInstallDesktop: mdiInstallDesktop,
            // mdiInstallMobile: mdiInstallMobile,
            cellphoneArrowDown: mdiCellphoneArrowDown,
            dotsVertical: mdiDotsVertical,
        },
        isStableRelease: utils.isStableRelease(),
        year: new Date().getFullYear()
    }),
    computed: {
        backendVersion() {
            return store.state.backendVersion;
        },
        frontendVersion() {
            return ffConfig.FRONTEND_VERSION;
        },
    },
    created: function () {
        eventBus.$emit('parentViewActivated');
    },
    mounted: function () {
        if(this.download) {
            this.$refs['helpDownload'].$el.scrollIntoView();
        } else if(this.share) {
            this.$refs['helpShare'].$el.scrollIntoView();
        }
    },
};
</script>

<style scoped>
.feedbackEmail {
    font-weight: bold;
    color: --var(--v-primary-base);
}

.v-card {
    scroll-margin-top: 60px;
}

.AppInfo {
    color: dimgray;
    text-align: center;
    font-size: smaller;
}

.Installed {
    color: var(--v-secondary-base);
}

.QRCode {
    max-width: 240px;
    min-width: 100px;
    width: 40vw;
    fill: var(--v-primary-darken1);
}

.UnstableRelease {
    background: var(--v-secondary-lighten5);
}

.WarningIcon {
    animation: blinker 1.5s linear infinite;
    color: var(--v-secondary-base);
}

@keyframes blinker {
    50% {
        opacity: 0.2;
    }
}
</style>