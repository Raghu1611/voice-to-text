/**
 * DeepgramService class
 * Handles WebSocket connection to Deepgram API.
 * Manages authentication and audio streaming.
 */

export type TranscriptCallback = (transcript: string, isFinal: boolean) => void;
export type ErrorCallback = (error: string) => void;

export class DeepgramService {
    private socket: WebSocket | null = null;
    private apiKey: string;
    private onTranscript: TranscriptCallback;
    private onError: ErrorCallback;

    constructor(apiKey: string, onTranscript: TranscriptCallback, onError: ErrorCallback) {
        this.apiKey = apiKey;
        this.onTranscript = onTranscript;
        this.onError = onError;
    }

    /**
     * Establish WebSocket connection to Deepgram.
     */
    connect(sampleRate: number): Promise<void> {
        return new Promise((resolve, reject) => {
            try {
                if (!this.apiKey) {
                    reject(new Error("Missing Deepgram API Key"));
                    return;
                }

                // Configure for raw audio (linear16) with dynamic sample rate
                // model: nova-2 (best accuracy)
                // smart_format: true (better punctuation and formatting)
                // endpointing: 300 (wait 300ms of silence before finalizing to allow full sentences to form)
                // vad_events: true (Deepgram sends explicit speech_started/speech_ended events)
                // utterance_end_ms: 1000 (Force end utterance after silence)
                const url = `wss://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=${sampleRate}&model=nova-2&smart_format=true&interim_results=true&endpointing=300&vad_events=true&utterance_end_ms=1000`;

                console.log('[DeepgramService] Connecting with sample rate:', sampleRate);

                // Deepgram expects 'token' subprotocol for auth
                this.socket = new WebSocket(url, ['token', this.apiKey]);

                this.socket.onopen = () => {
                    console.log('[DeepgramService] Connected');
                    resolve();
                };

                this.socket.onerror = (ev) => {
                    console.error('[DeepgramService] WebSocket Error', ev);
                    this.onError('WebSocket connection error');
                    reject(new Error('WebSocket connection failed'));
                };

                this.socket.onmessage = (message) => {
                    try {
                        const data = JSON.parse(message.data);

                        // Handle different message types (Metadata, Transcription, etc)
                        if (data.channel && data.channel.alternatives && data.channel.alternatives[0]) {
                            const alt = data.channel.alternatives[0];
                            if (alt.transcript) {
                                this.onTranscript(alt.transcript, data.is_final);
                            }
                        }
                    } catch (e) {
                        console.error('[DeepgramService] Error parsing message', e);
                    }
                };

                this.socket.onclose = () => {
                    console.log('[DeepgramService] Disconnected');
                };

            } catch (e) {
                reject(e);
            }
        });
    }

    /**
     * Send raw PCM audio chunk to Deepgram.
     */
    sendAudio(data: Int16Array): void {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(data);
        }
    }

    /**
     * Close the connection.
     */
    disconnect(): void {
        if (this.socket) {
            if (this.socket.readyState === WebSocket.OPEN) {
                // Send close stream message if possible (optional but good practice)
                this.socket.send(JSON.stringify({ type: 'CloseStream' }));
                this.socket.close();
            }
            this.socket = null;
        }
    }

    isConnected(): boolean {
        return this.socket !== null && this.socket.readyState === WebSocket.OPEN;
    }
}
