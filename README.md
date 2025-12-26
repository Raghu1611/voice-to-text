# VoiceFlow - Advanced Voice-to-Text Dashboard

VoiceFlow is a professional, high-performance voice transcription application built with **React**, **TypeScript**, **Vite**, and **Tauri**. It leverages the **Deepgram API** for state-of-the-art speech-to-text accuracy and the **Web Audio API** for real-time visual feedback and audio processing.

![VoiceFlow Screenshot](https://via.placeholder.com/800x450.png?text=VoiceFlow+Dashboard)

## 🚀 Key Features

*   **Real-time Transcription**: Instant, low-latency speech-to-text.
*   **Neural Orb Visualization**: A reactive UI element that pulsates with audio energy transparency.
*   **Voice Emotions/Reactions**: Detects context triggers (e.g., "fire", "idea", "love") and displays animated floating emojis.
*   **Focus Mode**: Toggleable sidebar for distraction-free dictation (`Ctrl+B`).
*   **Smart History**: Searchable session history with metadata (WPM, duration).
*   **Accessibility**: Dynamic font size controls and high-contrast dark/light themes.
*   **Read Aloud**: Native Text-to-Speech integration to playback transcripts.
*   **Professional Audio Stack**: Custom AudioWorklet integration bypassing standard browser noise gates for raw, high-fidelity input.

## 🛠️ Architecture

The codebase follows a **Clean Architecture** principle adapted for React:

*   **`/src/services`**: External API integrations (Deepgram). Decoupled from UI components.
*   **`/src/audio`**: Low-level Web Audio API logic. Handles `AudioContext`, `AnalyserNode`, and raw PCM conversion.
*   **`/src/hooks`**: Custom React hooks (e.g., `usePushToTalk`) that bridge the gap between Services/Audio and the UI. This encapsulates complex state logic like timing, WPM calculation, and connection status.
*   **`/src/styles`**: Pure CSS using modern Variables (`:root`) for instant, flicker-free theming.

### Technology Stack
*   **Frontend**: React 18, TypeScript, Vite
*   **Desktop Wrapper**: Tauri (Rust)
*   **AI Engine**: Deepgram Nova-2 Model
*   **State Management**: React Hooks (`useRef` for high-frequency audio data, `useState` for UI)

## 📦 Installation & Setup

### Prerequisites
*   Node.js (v18+)
*   Rust (for Tauri builds)
*   A Deepgram API Key

### 1. Clone & Install
```bash
git clone https://github.com/your-repo/voiceflow.git
cd voiceflow
npm install
```

### 2. Environment Configuration
Create a `.env` file in the root directory:
```env
VITE_DEEPGRAM_KEY=your_deepgram_api_key_here
```

### 3. Run Locally (Web)
```bash
npm run dev
```

### 4. Run Desktop App (Tauri)
```bash
npm run tauri dev
```

## 🧩 Code Structure & Professional Practices

### Error Handling
*   **Graceful Degradation**: Audio failures (e.g., mic permission denied) are caught in `audioRecorder.ts` and bubbled up to the UI as readable toasts.
*   **Connection Recovery**: The WebSocket service handles connection drops and notifies the user via the status badge.

### Optimization
*   **Raw PCM Streaming**: We convert Float32 audio to Int16 directly in the browser to minimize bandwidth and latency, simulating a real-time stream.
*   **Visualizer Performance**: The Neural Orb utilizes CSS transforms driven by requestAnimationFrame-aligned state updates for 60fps smoothness without blocking the main thread.
*   **Lean Dependencies**: Minimal external libraries. No heavy UI frameworks (Bootstrap/MUI) ensures a tiny bundle size and full control over styling.

## ⚠️ Known Limitations
*    **Browser Privacy**: You must allow microphone access every time on non-HTTPS localhost unless configured.
*   **Deepgram Key**: The key is currently exposed in the frontend build. For production, this should be proxied through a backend to prevent key leakage.

---
*Built with ❤️ by Antigravity*
