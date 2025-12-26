import { useState, useRef, useCallback, useEffect } from 'react';
import { AudioRecorder } from '../audio/audioRecorder';
import { DeepgramService } from '../services/deepgramService';
import { ClipboardService } from '../services/clipboardService';
import { register, unregisterAll } from '@tauri-apps/api/globalShortcut';
import { AudioAnalysisStatus } from '../audio/audioRecorder';

interface UsePushToTalkProps {
    apiKey: string;
}

export interface SessionRecord {
    id: string;
    timestamp: number;
    text: string;
    duration: number;
    wordCount: number;
}

export interface PushToTalkState {
    isRecording: boolean;
    transcript: string;
    interimTranscript: string;
    error: string | null;
    connectionState: 'disconnected' | 'connecting' | 'connected';
    autoInsert: boolean;
    history: SessionRecord[];
    statusMessage: string | null;
    audioStatus: AudioAnalysisStatus;
    // Live Stats
    sessionDuration: number;
    wordCount: number;
    charCount: number;
    volume: number;
}

export const usePushToTalk = ({ apiKey }: UsePushToTalkProps) => {
    const [state, setState] = useState<PushToTalkState>({
        isRecording: false,
        transcript: '',
        interimTranscript: '',
        error: null,
        connectionState: 'disconnected',
        autoInsert: false,
        history: [],
        statusMessage: null,
        audioStatus: 'silence',
        sessionDuration: 0,
        wordCount: 0,
        charCount: 0,
        volume: 0
    });

    const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([]);
    const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
    const recorderRef = useRef<AudioRecorder | null>(null);
    const deepgramRef = useRef<DeepgramService | null>(null);
    const startTimeRef = useRef<number>(0);

    // Fetch Audio Devices on Mount
    useEffect(() => {
        const getDevices = async () => {
            try {
                // We need permission first to see labels (often)
                // But we assume permission is granted after first 'start' usually
                // Or we can request it.
                // For a smooth UX, list devices. If labels are missing, we might need to trigger permission.
                const devices = await navigator.mediaDevices.enumerateDevices();
                const inputs = devices.filter(d => d.kind === 'audioinput');
                setAudioDevices(inputs);

                // Set default if not set
                if (inputs.length > 0 && !selectedDeviceId) {
                    // Try to find 'default' or pick first
                    const def = inputs.find(d => d.deviceId === 'default');
                    setSelectedDeviceId(def ? def.deviceId : inputs[0].deviceId);
                }
            } catch (e) {
                console.error("Failed to enum devices", e);
            }
        };

        getDevices();
        // Listen for device changes
        navigator.mediaDevices.addEventListener('devicechange', getDevices);
        return () => navigator.mediaDevices.removeEventListener('devicechange', getDevices);
    }, []);

    // ... (state def)
    const timerIntervalRef = useRef<number | null>(null);

    // --- Core Services Initialization ---
    const getServices = useCallback(() => {
        if (!deepgramRef.current) {
            deepgramRef.current = new DeepgramService(
                apiKey,
                (text, isFinal) => {
                    setState(prev => {
                        const newTranscript = isFinal
                            ? (prev.transcript ? `${prev.transcript} ${text}` : text)
                            : prev.transcript;

                        // Calculate stats on the fly
                        const fullText = isFinal ? newTranscript : (newTranscript + ' ' + text);
                        const words = fullText.trim().split(/\s+/).filter(w => w.length > 0).length;
                        const chars = fullText.length;

                        if (isFinal) {
                            return {
                                ...prev,
                                transcript: newTranscript,
                                interimTranscript: '',
                                wordCount: words,
                                charCount: chars
                            };
                        } else {
                            return {
                                ...prev,
                                interimTranscript: text,
                                wordCount: words,
                                charCount: chars
                            };
                        }
                    });

                    // Check for Voice Commands on final text
                    if (isFinal) {
                        const lower = text.toLowerCase().trim();
                        // We need actions but we are inside callback. 
                        // Calling setState is fine, but calling clearTranscript() which is defined below is tricky due to closure.
                        // But we can just use setState to clear.
                        if (lower.includes('clear transcript') || lower.includes('delete everything')) {
                            setState(prev => ({ ...prev, transcript: '', interimTranscript: '', wordCount: 0, charCount: 0 }));
                        }
                        // 'Stop listening' is harder because we need handleStop. 
                        // We'll leave that for the user button for now to avoid complexity in this hook structure.
                    }
                },
                (err) => setState(prev => ({ ...prev, error: err }))
            );
        }

        if (!recorderRef.current) {
            recorderRef.current = new AudioRecorder(
                (data) => {
                    if (deepgramRef.current && deepgramRef.current.isConnected()) {
                        // SEND EVERYTHING. Don't block. 
                        // The blocking logic was likely causing "not listening" issues for some microphones.
                        deepgramRef.current.sendAudio(data);
                    }
                },
                () => {
                    // Silence handling - Keep as is, it's useful.
                    setState(prev => ({ ...prev, statusMessage: "Paused due to silence" }));
                    // Don't stop entirely, just pause logic? No, let's keep it running.
                    // Actually, if we want "not listening" fixed, we should ignore silence timeout or handle it gently.
                    // For now, let's just log it.
                    // handleStop("Stopped due to silence");
                },
                (status) => {
                    // Just update UI, don't block logic here
                    setState(prev => ({ ...prev, audioStatus: status }));
                },
                (vol) => {
                    // Update volume for visualizer
                    // Use functional update to avoid stale closures, but check performance.
                    // React state updates at 60fps might be heavy?
                    // Let's debounce or just set it. 
                    // Actually, for a visualizer, we might want a Ref or direct DOM manipulation, 
                    // but State is fine for < 60 updates/sec if simple.
                    // AudioRecorder emits every ~50ms (20fps). It's fine.
                    setState(prev => ({ ...prev, volume: vol }));
                }
            );
        }
        return { recorder: recorderRef.current, deepgram: deepgramRef.current };
    }, [apiKey]);

    // --- Start Recording ---
    const startRecording = useCallback(async () => {
        setState(prev => ({
            ...prev,
            isRecording: true,
            error: null,
            statusMessage: null,
            transcript: '', // Optional: Start fresh? Or Keep? Let's keep for now unless explicit clear
            // Actually, usually PTT appends. Let's append but reset session timer.
            sessionDuration: 0
        }));

        startTimeRef.current = Date.now();

        // Start Timer for UI
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = window.setInterval(() => {
            setState(prev => ({
                ...prev,
                sessionDuration: Math.floor((Date.now() - startTimeRef.current) / 1000)
            }));
        }, 1000);

        try {
            const { recorder, deepgram } = getServices();
            // PASS SELECTED DEVICE ID
            const sampleRate = await recorder.start(selectedDeviceId);

            if (!deepgram.isConnected()) {
                setState(prev => ({ ...prev, connectionState: 'connecting' }));
                await deepgram.connect(sampleRate);
                setState(prev => ({ ...prev, connectionState: 'connected' }));
            }

        } catch (err: any) {
            console.error("Start recording failed:", err);
            setState(prev => ({
                ...prev,
                isRecording: false,
                connectionState: 'disconnected',
                error: err.message || 'Failed to start recording'
            }));
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        }
    }, [getServices]);

    // --- Stop Recording ---
    const handleStop = useCallback((reason?: string) => {
        if (timerIntervalRef.current) {
            clearInterval(timerIntervalRef.current);
            timerIntervalRef.current = null;
        }

        setState(current => {
            if (!current.isRecording) return current;

            const duration = (Date.now() - startTimeRef.current) / 1000;
            const fullText = current.interimTranscript ? `${current.transcript} ${current.interimTranscript}` : current.transcript;

            // Auto-Insert Logic
            if (current.autoInsert && fullText.trim()) {
                ClipboardService.copyToClipboard(fullText.trim());
            }

            // History
            const words = fullText.trim().split(/\s+/).filter(w => w.length > 0).length;
            const newRecord: SessionRecord = {
                id: Date.now().toString(),
                timestamp: Date.now(),
                text: fullText.trim(),
                duration,
                wordCount: words
            };

            return {
                ...current,
                isRecording: false,
                connectionState: 'disconnected',
                interimTranscript: '',
                statusMessage: reason || null,
                history: fullText.trim() ? [newRecord, ...current.history] : current.history,
                audioStatus: 'silence'
            };
        });

        const services = getServices();
        services.recorder.stop();
        services.deepgram.disconnect();

    }, [getServices]);

    const stopRecording = useCallback(() => {
        handleStop();
    }, [handleStop]);

    // --- Global Shortcut ---
    useEffect(() => {
        const shortcut = 'CommandOrControl+Shift+Space';
        const setupShortcut = async () => {
            try {
                await unregisterAll();
                await register(shortcut, () => {
                    window.dispatchEvent(new CustomEvent('global-ptt-toggle'));
                });
            } catch (e) {
                console.error('Failed to register global shortcut', e);
            }
        };
        setupShortcut();
        return () => { unregisterAll(); };
    }, []);

    useEffect(() => {
        const handleGlobalToggle = () => {
            if (recorderRef.current) { // Proxy check
                handleStop();
            } else {
                startRecording();
            }
        };
        window.addEventListener('global-ptt-toggle', handleGlobalToggle);
        return () => window.removeEventListener('global-ptt-toggle', handleGlobalToggle);
    }, [startRecording, handleStop]);

    const toggleAutoInsert = useCallback(() => {
        setState(prev => ({ ...prev, autoInsert: !prev.autoInsert }));
    }, []);

    const clearTranscript = useCallback(() => {
        setState(prev => ({ ...prev, transcript: '', wordCount: 0, charCount: 0, sessionDuration: 0 }));
    }, []);

    // Cleanup
    useEffect(() => {
        return () => {
            if (recorderRef.current) recorderRef.current.stop();
            if (deepgramRef.current) deepgramRef.current.disconnect();
            if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
            unregisterAll();
        };
    }, []);

    return {
        ...state,
        startRecording,
        stopRecording,
        toggleAutoInsert,
        clearTranscript,
        audioDevices,
        selectedDeviceId,
        setSelectedDeviceId,
        // State exposes volume now
    };
};
