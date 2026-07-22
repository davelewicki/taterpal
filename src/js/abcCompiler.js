// Client-side ABC to FolkFriend contour index compiler

const CONTOUR_TO_QUERY_CHAR = [
    'a', 'b', 'c', 'd', 'e', 
    'f', 'g', 'h', 'i', 'j', 
    'k', 'l', 'm', 'n', 'o',
    'p', 'q', 'r', 's', 't', 
    'u', 'v', 'w', 'x', 'y', 
    'z', 'A', 'B', 'C', 'D',
    'E', 'F', 'G', 'H', 'I',
    'J', 'K', 'L', 'M', 'N',
    'O', 'P', 'Q', 'R', 'S',
    'T', 'U', 'V'
];
const MIDI_LOW = 48;
const MIDI_HIGH = 95;

export function getKeyAccidentals(keyStr) {
    keyStr = (keyStr || '').trim().toLowerCase();
    if (keyStr.includes('hp')) {
        return { f: 1, c: 1 };
    }

    const match = keyStr.match(/^([a-g][#b]?)\s*(.*)$/);
    if (!match) {
        return {};
    }
    const root = match[1];
    const modeStr = match[2];

    const rootFifths = {
        'c': 0, 'g': 1, 'd': 2, 'a': 3, 'e': 4, 'b': 5, 'f#': 6, 'c#': 7,
        'f': -1, 'bb': -2, 'eb': -3, 'ab': -4, 'db': -5, 'gb': -6, 'cb': -7,
        'a#': -2, 'd#': -3, 'g#': -4
    };

    const rootVal = rootFifths[root] !== undefined ? rootFifths[root] : 0;
    let modeOffset = 0;

    if (modeStr.includes('mix') || modeStr.includes('mixolydian')) {
        modeOffset = -1;
    } else if (modeStr.includes('dor') || modeStr.includes('dorian')) {
        modeOffset = -2;
    } else if (
        (modeStr.includes('min') || modeStr.includes('minor') || modeStr.includes('aeo') || modeStr.includes('aeolian') || modeStr.includes('m')) &&
        !modeStr.startsWith('mix') && !modeStr.startsWith('maj')
    ) {
        modeOffset = -3;
    } else if (modeStr.includes('phr') || modeStr.includes('phrygian')) {
        modeOffset = -4;
    } else if (modeStr.includes('lyd') || modeStr.includes('lydian')) {
        modeOffset = 1;
    } else if (modeStr.includes('loc') || modeStr.includes('locrian')) {
        modeOffset = -5;
    }

    const totalFifths = rootVal + modeOffset;
    const accidentals = {};
    const sharpsOrder = ['f', 'c', 'g', 'd', 'a', 'e', 'b'];
    const flatsOrder = ['b', 'e', 'a', 'd', 'g', 'c', 'f'];

    if (totalFifths > 0) {
        const count = Math.min(totalFifths, 7);
        for (let i = 0; i < count; i++) {
            accidentals[sharpsOrder[i]] = 1;
        }
    } else if (totalFifths < 0) {
        const count = Math.min(-totalFifths, 7);
        for (let i = 0; i < count; i++) {
            accidentals[flatsOrder[i]] = -1;
        }
    }

    return accidentals;
}

export function extractContour(melody, keyStr, defaultLen) {
    const keyAccidentals = getKeyAccidentals(keyStr);
    const basePitches = {
        'C': 60, 'D': 62, 'E': 64, 'F': 65, 'G': 67, 'A': 69, 'B': 71,
        'c': 72, 'd': 74, 'e': 76, 'f': 77, 'g': 79, 'a': 81, 'b': 83
    };

    let measureAccidentals = {};
    let tupletCount = 0;
    let tupletMultiplier = 1.0;
    let inChord = false;
    let firstNoteInChord = true;
    const notes = [];

    // Regex matching bars, chords, tuplets, or notes
    const tokenRegex = /(\|[|:\]]?|:\||\[\|)|(\[)|(\])|(\(\d)|((\^\^|\^|__|_|=)?([A-Ga-gzx])([,']*)"?[^"]*"?(?:(\d+(?:\/\d+)?))?(\/(?:\d+)?)*)/g;

    let match;
    while ((match = tokenRegex.exec(melody)) !== null) {
        const [
            fullToken,
            bar,
            chordStart,
            chordEnd,
            tuplet,
            noteToken,
            acc,
            letter,
            octave,
            dur1,
            dur2
        ] = match;

        if (bar) {
            measureAccidentals = {};
        } else if (chordStart) {
            inChord = true;
            firstNoteInChord = true;
        } else if (chordEnd) {
            inChord = false;
        } else if (tuplet) {
            const val = parseInt(tuplet[1], 10);
            tupletCount = val;
            if (val === 3) tupletMultiplier = 2.0 / 3.0;
            else if (val === 2) tupletMultiplier = 3.0 / 2.0;
            else if (val === 4) tupletMultiplier = 3.0 / 4.0;
            else tupletMultiplier = 2.0 / 3.0;
        } else if (noteToken && letter) {
            if (inChord && !firstNoteInChord) {
                continue;
            }
            firstNoteInChord = false;

            let dur = 1.0;
            if (dur1) {
                if (dur1.includes('/')) {
                    const [n, d] = dur1.split('/').map(Number);
                    dur = n / d;
                } else {
                    dur = parseFloat(dur1);
                }
            }
            if (dur2) {
                if (dur2 === '/') {
                    dur *= 0.5;
                } else if (dur2 === '//') {
                    dur *= 0.25;
                } else {
                    const den = parseFloat(dur2.slice(1));
                    dur *= isNaN(den) ? 0.5 : (1.0 / den);
                }
            }

            dur *= tupletMultiplier;
            if (tupletCount > 0) {
                tupletCount--;
                if (tupletCount === 0) {
                    tupletMultiplier = 1.0;
                }
            }

            if (letter === 'z' || letter === 'x') {
                notes.push({ pitch: null, dur });
                continue;
            }

            let basePitch = basePitches[letter];
            if (!basePitch) continue;

            if (octave) {
                for (const char of octave) {
                    if (char === ',') basePitch -= 12;
                    else if (char === "'") basePitch += 12;
                }
            }

            let accVal = null;
            if (acc) {
                if (acc === '^') accVal = 1;
                else if (acc === '^^') accVal = 2;
                else if (acc === '_') accVal = -1;
                else if (acc === '__') accVal = -2;
                else if (acc === '=') accVal = 0;
                measureAccidentals[letter.toLowerCase()] = accVal;
            }

            if (accVal === null) {
                const letterLower = letter.toLowerCase();
                accVal = measureAccidentals[letterLower] !== undefined 
                    ? measureAccidentals[letterLower] 
                    : (keyAccidentals[letterLower] || 0);
            }

            const pitch = basePitch + accVal;
            notes.push({ pitch, dur });
        }
    }

    const quaverFactor = defaultLen * 8.0;
    const contour = [];

    for (const note of notes) {
        if (note.pitch === null) continue;
        const clampedPitch = Math.max(MIDI_LOW, Math.min(MIDI_HIGH, note.pitch));
        const charIdx = clampedPitch - MIDI_LOW;
        const char = CONTOUR_TO_QUERY_CHAR[charIdx];
        const quaverDur = Math.max(1, Math.round(note.dur * quaverFactor));
        for (let i = 0; i < quaverDur; i++) {
            contour.push(char);
        }
    }

    return contour.join('');
}

export function guessRhythm(meter) {
    meter = (meter || '').trim();
    if (meter.includes('3/4') || meter.includes('3/8')) {
        return 'waltz';
    } else if (meter.includes('6/8') || meter.includes('9/8')) {
        return 'jig';
    } else {
        return 'reel';
    }
}

export function parseAbcTunes(rawAbcContent, defaultBookName = 'Imported Book') {
    const lines = rawAbcContent.split(/\r?\n/);
    const tunes = [];
    let currentLines = [];

    for (const line of lines) {
        const stripped = line.trim();
        if (stripped.startsWith('X:')) {
            if (currentLines.length > 0) {
                tunes.push(currentLines);
            }
            currentLines = [line];
        } else {
            if (currentLines.length > 0 || stripped) {
                if (currentLines.length > 0) {
                    currentLines.push(line);
                }
            }
        }
    }
    if (currentLines.length > 0) {
        tunes.push(currentLines);
    }
    if (tunes.length === 0 && lines.length > 0) {
        tunes.push(lines);
    }

    const parsedTunes = [];

    for (const tuneLines of tunes) {
        let title = '';
        let key = 'C';
        let meter = '4/4';
        let defaultLen = 0.125;
        const melodyLines = [];
        const rawAbc = tuneLines.join('\n').trim();
        if (!rawAbc) continue;

        for (let line of tuneLines) {
            line = line.trim();
            if (!line) continue;
            if (line.startsWith('T:')) {
                if (!title) title = line.slice(2).trim();
            } else if (line.startsWith('K:')) {
                key = line.slice(2).split('%')[0].trim();
            } else if (line.startsWith('M:')) {
                meter = line.slice(2).split('%')[0].trim();
            } else if (line.startsWith('L:')) {
                const lenStr = line.slice(2).split('%')[0].trim();
                if (lenStr.includes('/')) {
                    try {
                        const [num, den] = lenStr.split('/').map(Number);
                        defaultLen = num / den;
                    } catch (e) {
                        // ignore
                    }
                }
            } else if (line.length >= 2 && /[a-zA-Z]/.test(line[0]) && line[1] === ':') {
                continue;
            } else {
                melodyLines.push(line.split('%')[0]);
            }
        }

        const melody = melodyLines.join('');
        if (!title) {
            title = `${defaultBookName}_${parsedTunes.length + 1}`;
        }

        parsedTunes.push({ title, key, meter, defaultLen, melody, rawAbc });
    }

    return parsedTunes;
}

export function compileAbcToDatabase(rawAbcContent, bookName = 'Custom Book') {
    const parsedTunes = parseAbcTunes(rawAbcContent, bookName);
    const settings = {};
    const aliases = {};
    let counter = 1;

    for (const tune of parsedTunes) {
        const contour = extractContour(tune.melody, tune.key, tune.defaultLen);
        if (!contour) continue;

        const id = String(counter++);
        settings[id] = {
            tune_id: id,
            meter: tune.meter,
            mode: tune.key,
            abc: tune.rawAbc,
            composer: '',
            dance: guessRhythm(tune.meter),
            contour: contour
        };

        aliases[id] = [tune.title.trim()];
    }

    return {
        settings,
        aliases
    };
}
