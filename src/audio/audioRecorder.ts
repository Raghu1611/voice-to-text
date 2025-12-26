export type AudioAnalysisStatus = 'speech' | 'music_noise' | 'silence' | 'unknown';

export class AudioRecorder {
    private mediaStream: MediaStream | null = null;
    private audioContext: AudioContext | null = null;
    private processor: ScriptProcessorNode | null = null;
    private input: MediaStreamAudioSourceNode | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;

    private onSilenceTimeout: () => void;
    private onStatusChange: ((status: AudioAnalysisStatus) => void) | null;

    // Callbacks
    private onDataAvailable: (data: Int16Array) => void;
    private onSilenceDetected?: () => void;

    // Analysis Config
    private silenceThreshold = 0.005;     // LOWERED: 0.5% Amplitude (was 2%)
    private musicThreshold = 0.6;        // Ratio of harmonic content
    private speechEnergyThreshold = 0.05; // Minimum energy for speech
    private silenceStart: number | null = null;
    private readonly SILENCE_DURATION = 2000; // Increased to 2s

    // Debug
    private debugCounter = 0;
    private lastStatus: AudioAnalysisStatus = 'unknown';

    private onVolumeChange: ((volume: number) => void) | null = null;

    constructor(
        onDataAvailable: (data: Int16Array) => void,
        onSilenceTimeout: () => void,
        onStatusChange?: (status: AudioAnalysisStatus) => void,
        onVolumeChange?: (volume: number) => void
    ) {
        this.onDataAvailable = onDataAvailable;
        this.onSilenceTimeout = onSilenceTimeout;
        this.onStatusChange = onStatusChange || null;
        this.onVolumeChange = onVolumeChange || null;
    }

    /**
     * Request microphone permission and start recording.
     * Converts Float32 audio to Int16 PCM.
     * Returns the sample rate of the audio context.
     */
    async start(deviceId?: string): Promise<number> {
        if (this.mediaStream) {
            this.stop();
        }

        try {
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: deviceId ? { exact: deviceId } : undefined,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            this.audioContext = new AudioContext();
            this.source = this.audioContext.createMediaStreamSource(this.mediaStream);

            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 512;
            this.analyser.smoothingTimeConstant = 0.1;
            this.source.connect(this.analyser);

            this.processor = this.audioContext.createScriptProcessor(4096, 1, 1);
            this.analyser.connect(this.processor);
            this.processor.connect(this.audioContext.destination);

            this.processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                const status = this.analyzeAudio(inputData);

                if (this.onStatusChange) {
                    this.onStatusChange(status);
                }

                // Simplified: Just stream everything.
                // We rely on Deepgram's VAD for silence, but we do keep our analyzeAudio 
                // for UI feedback (Visualizer/Status Badge).

                const int16Data = this.floatTo16BitPCM(inputData);
                this.onDataAvailable(int16Data);
            };

            await this.audioContext.resume();
            return this.audioContext.sampleRate;
        } catch (err) {
            console.error('Error opening audio input:', err);
            throw err;
        }
    }

    /**
     * Stop recording and cleanup resources.
     */
    stop(): void {
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        if (this.processor) {
            this.processor.disconnect();
            this.processor = null;
        }

        if (this.input) {
            this.input.disconnect();
            this.input = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }
    }

    /**
     * Convert Float32Array (Web Audio API default) to Int16Array (PCM).
     */
    private floatTo16BitPCM(input: Float32Array): Int16Array {
        const output = new Int16Array(input.length);
        for (let i = 0; i < input.length; i++) {
            // Clamp the value between -1 and 1
            const s = Math.max(-1, Math.min(1, input[i]));
            // Scale to 16-bit integer range
            output[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }
        return output;
    }

    /**
     * Advanced Audio Analysis
     * Determines if input is Speech, Music/Noise, or Silence.
     */
    private analyzeAudio(inputData: Float32Array): AudioAnalysisStatus {

        // Calculate raw volume (RMS)
        // inputData is -1 to 1.
        let sumSquares = 0;
        for (let i = 0; i < inputData.length; i++) {
            sumSquares += inputData[i] * inputData[i];
        }
        const rms = Math.sqrt(sumSquares / inputData.length);

        // Emit Volume (0-100 normalized approx)
        if (this.onVolumeChange) {
            // Logarithmic scale often better for audio
            // Simple linear for now: RMS of speech is usually 0.01 to 0.5
            const vol = Math.min(100, Math.round(rms * 400));
            this.onVolumeChange(vol);
        }

        const energy = rms; // Proxy for energy

        // Check Silence
        if (rms < this.silenceThreshold) {
            return 'silence';
        }

        // 2. Frequency Analysis (if active)
        if (this.analyser) {
            const bufferLength = this.analyser.frequencyBinCount;
            const dataArray = new Uint8Array(bufferLength);
            this.analyser.getByteFrequencyData(dataArray);

            // Calculate Spectral Centroid (Center of Mass of Spectrum)
            // Speech typically has lower centroid than broad-spectrum noise/music high-hats
            let weightedSum = 0;
            let totalWeight = 0;
            for (let i = 0; i < bufferLength; i++) {
                weightedSum += i * dataArray[i];
                totalWeight += dataArray[i];
            }
            const centroid = totalWeight > 0 ? weightedSum / totalWeight : 0;

            // Calculate Zero Crossing Rate (ZCR) - Rough estimate of frequency content/noisiness
            // Speech has moderate ZCR. Music/Noise often has very high (hiss) or very low (bass) ZCR consistency.
            // Calculate Zero Crossing Rate (ZCR)
            let zcr = 0;
            for (let i = 1; i < inputData.length; i++) {
                if ((inputData[i] >= 0 && inputData[i - 1] < 0) || (inputData[i] < 0 && inputData[i - 1] >= 0)) {
                    zcr++;
                }
            }
            const zcrRatio = zcr / inputData.length;

            // --- BUG DIAGNOSTICS (Requested by User) ---
            // Force logging every 60 frames (approx 1s) regardless of status
            if (!this.debugCounter) this.debugCounter = 0;
            this.debugCounter++;
            if (this.debugCounter % 50 === 0) { // Slightly faster logging
                console.log(`[AudioAnalysis] Status: ${this.lastStatus || 'active'} | RMS: ${rms.toFixed(5)} | Centroid: ${centroid.toFixed(1)} | ZCR: ${zcrRatio.toFixed(2)}`);
            }

            // Heuristic Tweak:
            // Speech Centroid is usually low (bins 10-40).
            // Music with drums/bass might be low too, but Music with hi-hats is high.
            // ZCR for speech is usually 0.05 - 0.2.
            // Noise/Hiss is ZCR > 0.4.

            // Blocking strict logic:
            if (centroid > 60 && zcrRatio > 0.3) {
                if (this.debugCounter % 50 === 0) {
                    console.warn('[AudioRecorder] Blocking High-Freq Noise/Music:', { centroid, zcrRatio });
                }
                this.lastStatus = 'music_noise';
                return 'music_noise';
            }
        }

        this.lastStatus = 'speech';
        return 'speech';
    }

    private handleSilenceTimeout(): void {
        if (this.silenceStart === null) {
            this.silenceStart = Date.now();
        } else {
            const elapsed = Date.now() - this.silenceStart;
            if (elapsed > this.SILENCE_DURATION) {
                if (this.onSilenceDetected) {
                    this.onSilenceDetected();
                    this.silenceStart = Date.now();
                }
            }
        }
    }
}
