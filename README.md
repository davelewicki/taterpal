# TaterPal

TaterPal is a browser-based, offline-capable "Shazam-like" melody search and pitch-contour recognition web application designed for American Old Time traditional music. 

This project is forked from the excellent open-source project [TomWyllie/folkfriend](https://github.com/TomWyllie/folkfriend) and is licensed under the GPL-3.0 license.

## Key Features & Customizations

* **Melody Search & Audio Recognition:** Listens to audio from the microphone or an uploaded file, extracts the pitch contour, and searches the matching index database.
* **Inline Playback**: Play MIDI transcriptions directly on the search results cards.
* **Auto-Muted Accompaniment**: Synthesis playback plays the melody only (chords/accompaniment tracks are muted).
* **Scroll-to-Text Highlights**: Intercepts cards matching external Old Time tune archives (like *TaterJoes* or *Old Time Fiddle Tunes*) and opens them natively in a new tab, automatically scrolling to and highlighting the exact tune reference.
* **Subdirectory/PWA Pathing**: Custom Webpack runtime paths to allow clean hosting in sub-folders (e.g. `https://snarch.app/taterpal/`) alongside other projects.
* **Local Development Cache Invalidation**: Automatically bypasses IndexedDB and service worker caching on `localhost` for rapid iteration.

## Project Setup

### Install Dependencies
```bash
npm install
```

### Run Local Development Server
```bash
npm run serve
```

### Compile Production Build
```bash
npm run build
```

## Licensing

TaterPal is open-source software licensed under the **GNU General Public License v3 (GPL-3.0)**. See the `LICENSE` file for the full text.
