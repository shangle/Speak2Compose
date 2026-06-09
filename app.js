// Speak2Compose - Phase 3 Core Engine
// Levenshtein fuzzy keyword matcher, genuine Clippy.js, Strudel script code transpiler, and Webamp event hooks.

// ==========================================
// 1. Audio Engine & Volume Mixer
// ==========================================
let audioContext = null;
let masterGainNode = null;
let synthPlayTimeoutId = null;
let isPlaying = false;
let isMuted = false;
let tempo = 120;
let defaultOctave = 4;
let activeGenre = 'popTechno';

// 12 Instruments mixer profiles
const MixerChannels = {
    kick: { volume: 0.8, muted: false, pan: 0.0 },
    snare: { volume: 0.5, muted: false, pan: -0.1 },
    hat: { volume: 0.4, muted: false, pan: 0.2 },
    clap: { volume: 0.4, muted: false, pan: -0.2 },
    bass: { volume: 0.6, muted: false, pan: 0.0, waveform: 'sawtooth' },
    synth: { volume: 0.5, muted: false, pan: -0.3, waveform: 'sawtooth', octaveOffset: 1, echo: false },
    chord: { volume: 0.4, muted: false, pan: 0.3, waveform: 'triangle', echo: false },
    bells: { volume: 0.3, muted: false, pan: 0.4, waveform: 'sine' },
    strings: { volume: 0.4, muted: false, pan: -0.4, waveform: 'triangle' },
    wind: { volume: 0.2, muted: false, pan: 0.0 },
    sweep: { volume: 0.4, muted: false, pan: 0.0 }
};

// ==========================================
// 2. Genre Pack Extension System
// ==========================================
const GenrePacks = {
    popTechno: {
        name: "Pop-Techno",
        defaultTempo: 128,
        patterns: {
            kick: [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0],
            snare: [0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            hat: [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 1],
            clap: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0],
            bass: [36, 36, 48, 36, 36, 36, 48, 36, 36, 36, 48, 36, 36, 48, 36, 48],
            synth: [60, 63, 65, 67, 70, 67, 65, 63, 60, 60, 63, 65, 67, 70, 72, 75],
            chord: [48, 48, 48, 48, 52, 52, 52, 52, 55, 55, 55, 55, 53, 53, 53, 53]
        },
        enabled: {
            kick: true,
            snare: false,
            hat: false,
            clap: false,
            bass: false,
            synth: false,
            chord: false,
            bells: false,
            strings: false,
            wind: false,
            sweep: false
        }
    }
};

// ==========================================
// 3. Webamp Integration & Sync
// ==========================================
let webamp = null;
let webampRendered = false;

function toggleWebamp() {
    const btn = document.getElementById('task-winamp');
    if (webampRendered) {
        if (webamp) {
            webamp.close();
            webamp = null;
        }
        webampRendered = false;
        btn.classList.remove('active');
        return;
    }

    if (!window.Webamp) {
        showClippySpeech("Webamp script loading failed.");
        return;
    }

    webamp = new window.Webamp({
        initialTracks: [
            {
                metaData: {
                    title: "Michael's Strudel Live Loop",
                    artist: "Speak2Compose"
                },
                url: "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAIlYAAESsAAACABAAZGF0YQAAAAA=" // Silent stub
            }
        ]
    });

    webamp.renderWhenReady(document.getElementById('webamp-container')).then(() => {
        webampRendered = true;
        btn.classList.add('active');
        showClippySpeech("Webamp is running. Use Webamp's Play/Stop buttons to run the synthesizer!");
        
        // Sync Playback events so Webamp Controls the Sound!
        webamp.onPlay(() => {
            executeMusicCode();
        });
        webamp.onPause(() => {
            stopMusicEngine();
        });
        webamp.onStop(() => {
            stopMusicEngine();
        });
    }).catch(err => {
        console.error("Webamp failed to load:", err);
    });
}

// ==========================================
// 4. Real Clippy.js Agent Support
// ==========================================
let clippyAgent = null;

$(window).on('load', () => {
    initClock();
    setupWindowListeners();
    setupStartMenu();
    initClippyAgent();
});

function initClippyAgent() {
    if (window.clippy) {
        window.clippy.load('Clippy', function(agent) {
            clippyAgent = agent;
            agent.show();
            // Hide the default static fallback clippy container
            document.getElementById('clippy-container').style.display = 'none';
            
            // Relocate Clippy to bottom right
            agent.moveTo($(window).width() - 160, $(window).height() - 160);
            
            // Set up click triggers directly on Clippy's DOM container
            $('.clippy').on('click', () => {
                agent.animate();
                toggleSpeechListening();
            });

            agent.speak("Welcome to Speak2Compose! Click me and say your commands to start coding.");
        });
    }
}

function showClippySpeech(text) {
    if (clippyAgent) {
        clippyAgent.speak(text);
    } else {
        // Fallback UI
        const bubble = document.getElementById('clippy-bubble');
        const bubbleText = document.getElementById('clippy-text');
        bubbleText.innerText = text;
        bubble.style.display = 'block';
        setTimeout(() => { bubble.style.display = 'none'; }, 6000);
    }
}

// ==========================================
// 5. Speech Recognition Loop
// ==========================================
function initSpeechRecognition() {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
        showClippySpeech("Speech recognition is not supported on this browser.");
        return false;
    }

    recognition = new SpeechClass();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => {
        isSpeechListening = true;
        document.getElementById('mic-status').innerText = "🔴 Listening";
        if (clippyAgent) {
            clippyAgent.play('GetAttention');
        }
        showClippySpeech("I am listening...");
    };

    recognition.onresult = (e) => {
        const transcript = e.results[0][0].transcript.toLowerCase().trim();
        processChainedCommands(transcript);
    };

    recognition.onerror = (e) => {
        showClippySpeech("Let's try again! Click me to speak.");
        cleanupSpeechState();
    };

    recognition.onend = () => {
        cleanupSpeechState();
    };

    return true;
}

function cleanupSpeechState() {
    isSpeechListening = false;
    document.getElementById('mic-status').innerText = "🎙️ Idle";
}

function toggleSpeechListening() {
    if (!recognition) {
        if (!initSpeechRecognition()) return;
    }
    if (isSpeechListening) {
        recognition.stop();
    } else {
        recognition.start();
    }
}

function processChainedCommands(transcript) {
    if (clippyAgent) {
        clippyAgent.play('SendMail');
    }
    
    const subcommands = transcript.split(/\band\b|\bthen\b/);
    
    subcommands.forEach(cmd => {
        executeIndividualCommand(cmd.trim());
    });

    updateQBasicDisplay();
    
    setTimeout(() => {
        executeMusicCode();
    }, 400);
}

// ==========================================
// 6. Fuzzy Match (Levenshtein Distance)
// ==========================================
function levenshteinDistance(s1, s2) {
    const track = Array(s2.length + 1).fill(null).map(() => Array(s1.length + 1).fill(null));
    for (let i = 0; i <= s1.length; i += 1) track[0][i] = i;
    for (let j = 0; j <= s2.length; j += 1) track[j][0] = j;
    for (let j = 1; j <= s2.length; j += 1) {
        for (let i = 1; i <= s1.length; i += 1) {
            const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
            track[j][i] = Math.min(
                track[j][i - 1] + 1, // deletion
                track[j - 1][i] + 1, // insertion
                track[j - 1][i - 1] + indicator // substitution
            );
        }
    }
    return track[s2.length][s1.length];
}

const VALID_KEYWORDS = [
    'kick', 'snare', 'hat', 'clap', 'bass', 'synth', 'melody', 
    'chord', 'harmony', 'bell', 'string', 'wind', 'sweep', 
    'drop', 'build', 'filter', 'faster', 'slower', 'clear', 'stop', 'mute'
];

function findFuzzyMatch(phrase) {
    const words = phrase.split(/\s+/);
    let matchedKeywords = [];

    words.forEach(word => {
        // Direct matches first
        if (VALID_KEYWORDS.includes(word)) {
            matchedKeywords.push(word);
            return;
        }

        // Search closest fuzzy keyword
        let bestMatch = null;
        let minDistance = Infinity;

        VALID_KEYWORDS.forEach(kw => {
            const d = levenshteinDistance(word, kw);
            if (d < minDistance) {
                minDistance = d;
                bestMatch = kw;
            }
        });

        // Set Levenshtein threshold
        if (minDistance <= Math.max(2, word.length / 2.5)) {
            matchedKeywords.push(bestMatch);
        }
    });

    return matchedKeywords;
}

// ==========================================
// 7. Command Interpreter & Strudel Writer
// ==========================================
function executeIndividualCommand(phrase) {
    const genre = GenrePacks[activeGenre];
    
    // Perform fuzzy alignment
    const matchedTokens = findFuzzyMatch(phrase);

    if (matchedTokens.includes('kick') || phrase.includes('bass drum')) {
        genre.enabled.kick = true;
    }
    if (matchedTokens.includes('snare')) {
        genre.enabled.snare = true;
    }
    if (matchedTokens.includes('hat') || phrase.includes('hi hat') || phrase.includes('cymbal')) {
        genre.enabled.hat = true;
    }
    if (matchedTokens.includes('clap')) {
        genre.enabled.clap = true;
    }
    if (matchedTokens.includes('bass')) {
        genre.enabled.bass = true;
    }
    if (matchedTokens.includes('synth') || matchedTokens.includes('melody') || phrase.includes('notes')) {
        genre.enabled.synth = true;
    }
    if (matchedTokens.includes('chord') || matchedTokens.includes('harmony')) {
        genre.enabled.chord = true;
    }
    if (matchedTokens.includes('bell')) {
        genre.enabled.bells = true;
    }
    if (matchedTokens.includes('string')) {
        genre.enabled.strings = true;
    }
    if (matchedTokens.includes('wind')) {
        genre.enabled.wind = true;
    }
    if (matchedTokens.includes('sweep')) {
        genre.enabled.sweep = true;
    }

    // Volume Modifiers
    const targetInst = detectInstrumentToken(phrase);
    if (targetInst) {
        if (phrase.includes('lower') || phrase.includes('quiet') || phrase.includes('down')) {
            MixerChannels[targetInst].volume = Math.max(0.1, MixerChannels[targetInst].volume - 0.25);
        }
        if (phrase.includes('raise') || phrase.includes('crank') || phrase.includes('up')) {
            MixerChannels[targetInst].volume = Math.min(1.0, MixerChannels[targetInst].volume + 0.25);
        }
        if (phrase.includes('mute') || phrase.includes('silence')) {
            MixerChannels[targetInst].muted = true;
        }
        if (phrase.includes('unmute')) {
            MixerChannels[targetInst].muted = false;
        }
    }

    // Speed modifiers
    if (matchedTokens.includes('faster') || phrase.includes('speed up')) {
        tempo = Math.min(220, tempo + 15);
    }
    if (matchedTokens.includes('slower') || phrase.includes('slow down')) {
        tempo = Math.max(60, tempo - 15);
    }

    // Transitions
    if (phrase.includes('drop') || phrase.includes('bass drop')) {
        triggerBassDrop();
    }
    if (phrase.includes('build')) {
        triggerDrumBuild();
    }
    if (phrase.includes('filter')) {
        triggerFilterSweep();
    }

    if (matchedTokens.includes('clear')) {
        Object.keys(genre.enabled).forEach(k => genre.enabled[k] = false);
    }
    if (matchedTokens.includes('stop')) {
        stopMusicEngine();
    }
}

function detectInstrumentToken(phrase) {
    if (phrase.includes('kick') || phrase.includes('drum')) return 'kick';
    if (phrase.includes('snare')) return 'snare';
    if (phrase.includes('hat') || phrase.includes('cymbal')) return 'hat';
    if (phrase.includes('clap')) return 'clap';
    if (phrase.includes('bass')) return 'bass';
    if (phrase.includes('synth') || phrase.includes('melody')) return 'synth';
    if (phrase.includes('chord') || phrase.includes('harmony')) return 'chord';
    if (phrase.includes('bell')) return 'bells';
    if (phrase.includes('string')) return 'strings';
    return null;
}

// Writes valid, copy-pasteable Strudel format code to QBasic editor
function updateQBasicDisplay() {
    const editorEl = document.getElementById('qbasic-editor-content');
    const genre = GenrePacks[activeGenre];
    
    let code = `// SPEAK2COMPOSE V2.0 - STRUDEL LIVE CODE\n`;
    code += `// Speak commands to Clippy to generate music!\n`;
    code += `// Copy-paste this block directly into strudel.cc\n\n`;
    
    let activePats = [];
    
    if (genre.enabled.kick && !MixerChannels.kick.muted) {
        activePats.push(`  s("kick*4").gain(${MixerChannels.kick.volume.toFixed(1)})`);
    }
    if (genre.enabled.snare && !MixerChannels.snare.muted) {
        activePats.push(`  s("~ snare").gain(${MixerChannels.snare.volume.toFixed(1)})`);
    }
    if (genre.enabled.hat && !MixerChannels.hat.muted) {
        activePats.push(`  s("hat*8").gain(${MixerChannels.hat.volume.toFixed(1)})`);
    }
    if (genre.enabled.clap && !MixerChannels.clap.muted) {
        activePats.push(`  s("~ clap").gain(${MixerChannels.clap.volume.toFixed(1)})`);
    }
    if (genre.enabled.bass && !MixerChannels.bass.muted) {
        activePats.push(`  note("c2 e2 g2 a2").s("${MixerChannels.bass.waveform}").gain(${MixerChannels.bass.volume.toFixed(1)})`);
    }
    if (genre.enabled.synth && !MixerChannels.synth.muted) {
        let oct = defaultOctave;
        activePats.push(`  note("c${oct} e${oct} g${oct} b${oct}").s("${MixerChannels.synth.waveform}").gain(${MixerChannels.synth.volume.toFixed(1)})${MixerChannels.synth.echo ? '.delay(0.4)' : ''}`);
    }
    if (genre.enabled.chord && !MixerChannels.chord.muted) {
        activePats.push(`  note("c3 g3 a3 f3").s("triangle").gain(${MixerChannels.chord.volume.toFixed(1)})${MixerChannels.chord.echo ? '.delay(0.5)' : ''}`);
    }
    if (genre.enabled.bells && !MixerChannels.bells.muted) {
        activePats.push(`  note("c6 e6 g6").s("sine").gain(${MixerChannels.bells.volume.toFixed(1)})`);
    }
    if (genre.enabled.strings && !MixerChannels.strings.muted) {
        activePats.push(`  note("c3 g3 a3").s("triangle").gain(${MixerChannels.strings.volume.toFixed(1)})`);
    }
    
    if (activePats.length > 0) {
        code += `stack(\n${activePats.join(',\n')}\n)`;
    } else {
        code += `stack(\n  // Speak commands to add tracks!\n)`;
    }
    
    editorEl.innerText = code;
}

// ==========================================
// 8. Synthesis Engine Scheduling
// ==========================================
function initAudio() {
    if (audioContext) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
    
    masterGainNode = audioContext.createGain();
    masterGainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    masterGainNode.connect(audioContext.destination);
}

function executeMusicCode() {
    stopMusicEngine();
    initAudio();

    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }

    isPlaying = true;
    playStepLoop(0);
}

function playStepLoop(step) {
    if (!isPlaying) return;

    const genre = GenrePacks[activeGenre];
    const timeOffset = audioContext.currentTime + 0.05;
    const stepDuration = 60 / tempo / 4;

    if (genre.enabled.kick && genre.patterns.kick[step] && !MixerChannels.kick.muted) {
        playSynthKick(timeOffset, stepDuration * 1.5, MixerChannels.kick.volume);
    }
    if (genre.enabled.snare && genre.patterns.snare[step] && !MixerChannels.snare.muted) {
        playSynthSnare(timeOffset, stepDuration, MixerChannels.snare.volume);
    }
    if (genre.enabled.hat && genre.patterns.hat[step] && !MixerChannels.hat.muted) {
        playSynthHat(timeOffset, stepDuration, MixerChannels.hat.volume);
    }
    if (genre.enabled.clap && genre.patterns.clap[step] && !MixerChannels.clap.muted) {
        playSynthClap(timeOffset, stepDuration, MixerChannels.clap.volume);
    }
    if (genre.enabled.bass && genre.patterns.bass[step] && !MixerChannels.bass.muted) {
        const midiNote = genre.patterns.bass[step];
        const freq = midiToFreq(midiNote);
        playSynthMelody(freq, stepDuration * 0.9, timeOffset, MixerChannels.bass.waveform, MixerChannels.bass.volume);
    }
    if (genre.enabled.synth && genre.patterns.synth[step] && !MixerChannels.synth.muted) {
        const midiNote = genre.patterns.synth[step] + (defaultOctave - 4) * 12;
        const freq = midiToFreq(midiNote);
        playSynthMelody(freq, stepDuration * 1.2, timeOffset, MixerChannels.synth.waveform, MixerChannels.synth.volume, MixerChannels.synth.echo);
    }
    if (genre.enabled.chord && genre.patterns.chord[step] && !MixerChannels.chord.muted) {
        const rootFreq = midiToFreq(genre.patterns.chord[step]);
        playChord(rootFreq, stepDuration * 3.5, timeOffset, MixerChannels.chord.volume);
    }

    const nextStep = (step + 1) % 16;
    synthPlayTimeoutId = setTimeout(() => {
        playStepLoop(nextStep);
    }, stepDuration * 1000);
}

function stopMusicEngine() {
    isPlaying = false;
    if (synthPlayTimeoutId) clearTimeout(synthPlayTimeoutId);
}

function midiToFreq(note) {
    return 440 * Math.pow(2, (note - 69) / 12);
}

// ==========================================
// 9. Core Synths
// ==========================================
function playSynthKick(time, duration, volume) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.frequency.setValueAtTime(140, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.12);
    gain.gain.setValueAtTime(volume * 0.6, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    gain.connect(masterGainNode);
    osc.start(time);
    osc.stop(time + duration);
}

function playSynthSnare(time, duration, volume) {
    const bufferSize = audioContext.sampleRate * duration;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(800, time);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(volume * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    noise.start(time);
    noise.stop(time + duration);
}

function playSynthHat(time, duration, volume) {
    const bufferSize = audioContext.sampleRate * 0.05;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(6000, time);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(volume * 0.25, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.04);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    noise.start(time);
    noise.stop(time + 0.05);
}

function playSynthClap(time, duration, volume) {
    const bufferSize = audioContext.sampleRate * 0.15;
    const buffer = audioContext.createBuffer(1, bufferSize, audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = audioContext.createBufferSource();
    noise.buffer = buffer;
    const filter = audioContext.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1200, time);
    const gain = audioContext.createGain();
    gain.gain.setValueAtTime(volume * 0.4, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
    gain.gain.setValueAtTime(volume * 0.3, time + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(masterGainNode);
    noise.start(time);
    noise.stop(time + 0.15);
}

function playSynthMelody(frequency, duration, time, waveType, volume, useEcho = false) {
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = waveType;
    osc.frequency.setValueAtTime(frequency, time);
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(volume * 0.35, time + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, time + duration);
    osc.connect(gain);
    if (useEcho) {
        const delay = audioContext.createDelay();
        delay.delayTime.value = 0.2;
        const feedback = audioContext.createGain();
        feedback.gain.value = 0.4;
        gain.connect(delay);
        delay.connect(feedback);
        feedback.connect(delay);
        delay.connect(masterGainNode);
    }
    gain.connect(masterGainNode);
    osc.start(time);
    osc.stop(time + duration);
}

function playChord(rootFreq, duration, time, volume) {
    const notes = [rootFreq, rootFreq * 1.2, rootFreq * 1.5];
    notes.forEach(f => {
        playSynthMelody(f, duration, time, 'triangle', volume * 0.5);
    });
}

function triggerBassDrop() {
    showClippySpeech("🔊 DROPPING THE BASS!");
    MixerChannels.kick.volume = 1.0;
    const time = audioContext.currentTime;
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(100, time);
    osc.frequency.exponentialRampToValueAtTime(10, time + 1.2);
    gain.gain.setValueAtTime(0.9, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 1.2);
    osc.connect(gain);
    gain.connect(masterGainNode);
    osc.start(time);
    osc.stop(time + 1.2);
}

function triggerDrumBuild() {
    showClippySpeech("🥁 DRUM BUILD-UP!");
    const time = audioContext.currentTime;
    for (let i = 0; i < 8; i++) {
        playSynthSnare(time + (i * 0.1), 0.05, 0.4 + (i * 0.05));
    }
}

function triggerFilterSweep() {
    showClippySpeech("🎛️ FILTER SWEEP!");
    const filter = audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(200, audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(8000, audioContext.currentTime + 1.5);
    masterGainNode.disconnect(audioContext.destination);
    masterGainNode.connect(filter);
    filter.connect(audioContext.destination);
    setTimeout(() => {
        filter.disconnect(audioContext.destination);
        masterGainNode.disconnect(filter);
        masterGainNode.connect(audioContext.destination);
    }, 1600);
}

// ==========================================
// 10. Window Layering
// ==========================================
let dragTarget = null;
let dragStartX = 0;
let dragStartY = 0;
let windowOffsetX = 0;
let windowOffsetY = 0;

function initClock() {
    const clockEl = document.getElementById('system-clock');
    const updateTime = () => {
        const now = new Date();
        clockEl.innerText = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    updateTime();
    setInterval(updateTime, 1000 * 60);
}

function dragStart(e, windowId) {
    focusWindow(windowId);
    const windowEl = document.getElementById(windowId);
    if (e.target.classList.contains('win98-btn')) return;

    dragTarget = windowEl;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    windowOffsetX = windowEl.offsetLeft;
    windowOffsetY = windowEl.offsetTop;

    document.addEventListener('mousemove', dragMove);
    document.addEventListener('mouseup', dragEnd);
    e.preventDefault();
}

function dragMove(e) {
    if (!dragTarget) return;
    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;
    dragTarget.style.left = `${windowOffsetX + dx}px`;
    dragTarget.style.top = `${windowOffsetY + dy}px`;
}

function dragEnd() {
    dragTarget = null;
    document.removeEventListener('mousemove', dragMove);
    document.removeEventListener('mouseup', dragEnd);
}

function focusWindow(windowId) {
    document.querySelectorAll('.window').forEach(w => {
        w.classList.remove('active-window');
    });
    const win = document.getElementById(windowId);
    if (win) {
        win.classList.add('active-window');
        win.style.display = 'flex';
    }

    document.querySelectorAll('.taskbar-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const typeName = windowId.split('-')[0];
    const taskBtn = document.getElementById(`task-${typeName}`);
    if (taskBtn) taskBtn.classList.add('active');
}

function toggleWindow(windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;
    const typeName = windowId.split('-')[0];
    const taskBtn = document.getElementById(`task-${typeName}`);

    if (win.style.display === 'none' || win.style.display === '') {
        focusWindow(windowId);
        if (taskBtn) taskBtn.classList.add('active');
    } else {
        win.style.display = 'none';
        if (taskBtn) taskBtn.classList.remove('active');
    }
}

function minimizeWindow(windowId) {
    const win = document.getElementById(windowId);
    if (win) win.style.display = 'none';
    const typeName = windowId.split('-')[0];
    const taskBtn = document.getElementById(`task-${typeName}`);
    if (taskBtn) taskBtn.classList.remove('active');
}

function maximizeWindow(windowId) {
    const win = document.getElementById(windowId);
    if (!win) return;
    if (win.style.width === '100%') {
        win.style.width = '58%';
        win.style.height = '78%';
        win.style.left = '3%';
        win.style.top = '3%';
    } else {
        win.style.width = '100%';
        win.style.height = 'calc(100vh - 40px)';
        win.style.left = '0';
        win.style.top = '0';
    }
}

function setupStartMenu() {
    const startBtn = document.getElementById('start-button');
    const startMenu = document.getElementById('start-menu');
    startBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStartMenu();
    });
    document.addEventListener('click', () => {
        startMenu.style.display = 'none';
    });
}

function toggleStartMenu() {
    const startMenu = document.getElementById('start-menu');
    startMenu.style.display = startMenu.style.display === 'none' ? 'flex' : 'none';
}

function setupWindowListeners() {
    document.querySelectorAll('.window').forEach(win => {
        win.addEventListener('mousedown', () => {
            focusWindow(win.id);
        });
    });
}
