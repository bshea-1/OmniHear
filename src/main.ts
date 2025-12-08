import './style.css';
import { RobotAvatar } from './RobotAvatar';
// Global State
let robotAvatar: RobotAvatar | null = null;
let isRunning = false;

// --- Application Logic ---

function logTranscript(msg: string) {
    const t = document.getElementById('transcript');
    if (t) {
        // Append new message with timestamp
        const timestamp = new Date().toLocaleTimeString();
        const currentText = t.innerText;
        const newText = currentText === 'System Ready. Use the microphone or type below.'
            ? `[${timestamp}] ${msg}`
            : `${currentText}\n[${timestamp}] ${msg}`;
        t.innerText = newText;
        // Auto-scroll to bottom
        t.scrollTop = t.scrollHeight;
    }
}

function speak(text: string) {
    if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(text);
        window.speechSynthesis.speak(utterance);
    }
}



// Speech Recognition State
let recognition: any = null;
let isListening = false;

function getMicStatusEl() {
    return document.getElementById('mic-status');
}

function updateMicUI(listening: boolean) {
    const el = getMicStatusEl();
    const btn = document.getElementById('mic-toggle-btn');

    if (el) {
        if (listening) el.classList.add('bg-red-500', 'animate-pulse', 'shadow-red-500/50');
        else el.classList.remove('bg-red-500', 'animate-pulse', 'shadow-red-500/50');
    }

    if (btn) {
        btn.textContent = listening ? "Stop Listening" : "Start Listening";
        btn.classList.toggle('bg-red-600', listening);
        btn.classList.toggle('bg-blue-600', !listening);
    }
}

async function checkMicrophonePermission(): Promise<boolean> {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // Stop all tracks immediately after checking
        stream.getTracks().forEach(track => track.stop());
        return true;
    } catch (err: any) {
        console.error("Microphone permission error:", err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            logTranscript("Error: Microphone permission denied.");
            logTranscript("Please allow microphone access in your browser settings.");
        } else if (err.name === 'NotFoundError') {
            logTranscript("Error: No microphone found.");
        } else {
            logTranscript(`Error: ${err.message}`);
        }
        return false;
    }
}

function setupAudio() {
    // Return existing if already setup
    if (recognition) return recognition;

    // @ts-ignore
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {

        recognition = new SpeechRecognition();
        recognition.continuous = false; // Changed to false for stability
        recognition.lang = 'en-US';
        recognition.interimResults = false;
        recognition.maxAlternatives = 1;

        recognition.onstart = () => {
            isListening = true;
            updateMicUI(true);
        };

        recognition.onend = () => {
            updateMicUI(false);

            // Auto-restart if we are supposed to be listening
            // This replaces 'continuous: true' with a more stable manual loop
            if (isListening) {
                setTimeout(() => {
                    try {
                        recognition.start();
                    } catch (e) {
                        console.log("Restart ignored", e);
                        isListening = false;
                    }
                }, 100);
            }
        };

        recognition.onerror = (event: any) => {
            console.error("Speech Error Details:", event);

            if (event.error === 'not-allowed') {
                logTranscript("❌ Microphone access denied. Please allow in browser settings.");
            } else if (event.error === 'network') {
                logTranscript("❌ Network error. Use the text input below.");
            } else if (event.error !== 'aborted' && event.error !== 'no-speech') {
                logTranscript(`❌ Error: ${event.error}`);
            }

            // Ensure UI reflects stopped state
            isListening = false;
            updateMicUI(false);
        };


        recognition.onresult = (event: any) => {
            const last = event.results.length - 1;
            const transcript = event.results[last][0].transcript.trim();
            console.log("Heard:", transcript);
            logTranscript(`✅ You said: "${transcript}"`);

            if (robotAvatar) {
                // Pass the full sentence to the avatar
                // The avatar will handle ASL gloss conversion and word processing
                robotAvatar.triggerAnimation(transcript);
            }
        };
    } else {
        logTranscript("❌ Web Speech API not supported in this browser.");
        logTranscript("Please use Chrome, Edge, or Safari.");
    }
    return recognition;
}

async function toggleListening() {
    if (!recognition) setupAudio();
    if (!recognition) return;

    if (isListening) {
        // User explicitly wants to stop
        isListening = false;
        recognition.stop();
    } else {
        // User wants to start
        isListening = true; // Set flag so onend knows to restart

        // Check microphone permission first
        const hasPermission = await checkMicrophonePermission();
        if (!hasPermission) {
            isListening = false;
            logTranscript("Cannot start: Microphone permission required.");
            return;
        }

        try {
            recognition.start();
        } catch (e: any) {
            isListening = false;
            console.warn("Start failed", e);
            if (e.message && e.message.includes('already started')) {
                logTranscript("Speech recognition already running.");
            } else {
                logTranscript(`Error starting: ${e.message}`);
            }
        }
    }
}

// Mic Toggle Logic
const micToggleBtn = document.getElementById('mic-toggle-btn');
if (micToggleBtn) micToggleBtn.addEventListener('click', toggleListening);

function handleTextInput() {
    const input = document.getElementById('chat-input') as HTMLInputElement;
    const text = input.value.trim();

    if (!text) return;

    console.log("Chat Input:", text);
    logTranscript(`You typed: "${text}"`);

    // Speak it (TTS)
    speak(text);

    // Pass full sentence to avatar for ASL processing
    if (robotAvatar) {
        robotAvatar.triggerAnimation(text);
    }

    input.value = '';
}

function startGame() {
    console.log("[Main] Starting Game...");

    isRunning = true;

    // Init Systems
    robotAvatar = new RobotAvatar('canvas-container');
    console.log("[Main] RobotAvatar Created");

    setupAudio();

    // Main Render Loop
    mainLoop();
    console.log("[Main] Main Loop Started");
}

function mainLoop() {
    requestAnimationFrame(mainLoop);
    if (robotAvatar) robotAvatar.animate();
}

// Event Listeners
const chatBtn = document.getElementById('chat-btn');
if (chatBtn) chatBtn.addEventListener('click', handleTextInput);

const chatInput = document.getElementById('chat-input');
if (chatInput) chatInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') handleTextInput();
});

// Auto-start on page load
console.log("[Main] Page Loaded. Auto-starting...");
startGame();
