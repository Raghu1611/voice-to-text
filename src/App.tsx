import React, { useRef, useEffect } from 'react';
import { usePushToTalk } from './hooks/usePushToTalk';
import './styles/app.css';

function App() {
    const apiKey = import.meta.env.VITE_DEEPGRAM_KEY || '';
    const [theme, setTheme] = React.useState('dark');
    const [searchTerm, setSearchTerm] = React.useState(''); // New: Search History
    const [fontSize, setFontSize] = React.useState(24); // Start at 24px (1.5rem default) to be visible match to CSS
    const [showSidebar, setShowSidebar] = React.useState(true); // New: Focus Mode
    const [reactions, setReactions] = React.useState<{ id: number, emoji: string, x: number, y: number }[]>([]); // New: Reaction State

    const {
        isRecording,
        transcript,
        interimTranscript,
        connectionState,
        error,
        statusMessage,
        autoInsert,
        history,
        audioStatus,
        sessionDuration,
        wordCount,
        charCount,
        startRecording,
        stopRecording,
        toggleAutoInsert,
        clearTranscript,
        audioDevices,
        selectedDeviceId,
        setSelectedDeviceId,
        volume // expose volume
    } = usePushToTalk({ apiKey });

    const scrollRef = useRef<HTMLDivElement>(null);

    // Reaction Logic
    useEffect(() => {
        const keywords: { [key: string]: string } = {
            'fire': '🔥',
            'idea': '💡',
            'lightbulb': '💡',
            'good': '👍',
            'awesome': '🎉',
            'excellent': '🎉',
            'love': '❤️',
            'question': '❓',
            'warning': '⚠️',
            'important': '⭐',
            'cool': '😎',
            'wow': '😯',
            'sad': '😢',
            'happy': '😄',
            'rocket': '🚀',
            'launch': '🚀'
        };

        // Check active speech (interim)
        const words = interimTranscript.toLowerCase().trim().split(/\s+/);
        const lastWord = words[words.length - 1];
        const secondLastWord = words[words.length - 2];

        // Check single word match
        let match = keywords[lastWord];
        // Check double word match (optional, simple for now)

        if (match) {
            const id = Date.now();
            // Debounce: Avoid spamming the same emoji check
            // Currently we rely on the fact that interim updates frequently. 
            // We need to ensure we don't trigger the same exact instance multiple times.
            // We can compare against a ref, but for a "fun" feature, a little spam is okay.
            // Let's throttle it to 1 per 500ms regardless of word to prevent chaos.

            setReactions(prev => {
                const last = prev[prev.length - 1];
                if (last && (id - last.id < 800)) return prev; // Global throttle
                return [...prev, {
                    id,
                    emoji: match,
                    x: 40 + Math.random() * 20, // Center cluster
                    y: 60 + Math.random() * 20
                }];
            });

            setTimeout(() => {
                setReactions(prev => prev.filter(r => r.id !== id));
            }, 2000);
        }
    }, [interimTranscript]);

    // Auto-scroll
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [transcript, interimTranscript]);

    const toggleRecording = () => {
        if (isRecording) {
            stopRecording();
        } else {
            if (!apiKey) {
                alert("Please set VITE_DEEPGRAM_KEY in .env");
                return;
            }
            startRecording();
        }
    };

    // Theme Toggle Effect
    useEffect(() => {
        if (theme === 'light') {
            document.body.classList.add('light-mode');
        } else {
            document.body.classList.remove('light-mode');
        }
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => prev === 'dark' ? 'light' : 'dark');
    };

    // Calculate WPM (Words Per Minute)
    const wpm = sessionDuration > 0 ? Math.round((wordCount / sessionDuration) * 60) : 0;

    // Format Duration
    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Export Functionality
    const handleExport = () => {
        const element = document.createElement("a");
        const file = new Blob([transcript], { type: 'text/plain' });
        element.href = URL.createObjectURL(file);
        element.download = `transcript_${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.txt`;
        document.body.appendChild(element); // Required for this to work in FireFox
        element.click();
        document.body.removeChild(element);
    };

    // Read Aloud (TTS)
    const handleReadAloud = () => {
        if (!transcript) return;
        const utterance = new SpeechSynthesisUtterance(transcript);
        // utterance.lang = language; // If we had language access here easily, but we cleaned it up. default is ok.
        window.speechSynthesis.cancel(); // Stop previous
        window.speechSynthesis.speak(utterance);
    };

    // Keyboard Access
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
            if (e.code === 'Space') {
                e.preventDefault();
                toggleRecording();
            }
            // Toggle Sidebar
            if (e.code === 'KeyB' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                setShowSidebar(prev => !prev);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [toggleRecording]);

    // Filter History
    const filteredHistory = history.filter(item =>
        item.text.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="layout-container">
            {/* LEFT SIDEBAR: HISTORY */}
            {showSidebar && (
                <aside className="sidebar">
                    <div className="brand">
                        <div className="logo-icon">V</div>
                        <span>VoiceFlow</span>
                    </div>

                    <div className="search-box">
                        <input
                            type="text"
                            placeholder="Search history..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>

                    <div className="history-label">RECENT SESSIONS</div>
                    <div className="history-list-container">
                        {filteredHistory.length === 0 ? (
                            <div className="empty-history">
                                {searchTerm ? 'No matches found' : 'No recordings yet'}
                            </div>
                        ) : (
                            filteredHistory.map(item => (
                                <div key={item.id} className="history-card">
                                    <div className="h-time">{new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
                                    <div className="h-preview">{item.text.slice(0, 35)}...</div>
                                    <div className="h-meta">{item.wordCount} words • {item.duration.toFixed(0)}s</div>
                                </div>
                            ))
                        )}
                    </div>
                </aside>
            )}

            {/* MAIN CONTENT */}
            <main className="main-area">
                {/* HUD HEADER */}
                <header className="hud-header">
                    <div className="hud-status">
                        <div className={`status-dot ${connectionState}`}></div>
                        <span>{connectionState === 'connected' ? 'Ready' : connectionState}</span>
                    </div>

                    <div className="hud-stats">
                        <div className="stat-pill">
                            <span className="label">Time</span>
                            <span className="value">{formatTime(sessionDuration)}</span>
                        </div>
                        <div className="stat-pill">
                            <span className="label">Words</span>
                            <span className="value">{wordCount}</span>
                        </div>
                        <div className="stat-pill">
                            <span className="label">Speed</span>
                            <span className="value">{wpm} wpm</span>
                        </div>
                    </div>

                    <div className="hud-actions">
                        {/* Mic Selector */}
                        <div className="mic-selector-container">
                            <select
                                className="mic-select"
                                value={selectedDeviceId}
                                onChange={(e) => setSelectedDeviceId(e.target.value)}
                                disabled={isRecording}
                                title="Select Microphone"
                            >
                                {audioDevices.length === 0 && <option>Default Microphone</option>}
                                {audioDevices.map(d => (
                                    <option key={d.deviceId} value={d.deviceId}>{d.label || `Microphone ${d.deviceId.slice(0, 5)}...`}</option>
                                ))}
                            </select>
                        </div>

                        {/* Sidebar Toggle */}
                        <button className="icon-btn" onClick={() => setShowSidebar(s => !s)} title={showSidebar ? "Focus Mode" : "Show Sidebar"} style={{ marginRight: 10, border: '1px solid #444' }}>
                            {showSidebar ? '⇖' : '⇗'}
                        </button>

                        {/* Font Size Controls */}
                        <div className="font-controls">
                            <button className="icon-btn font-btn" onClick={() => setFontSize(prev => Math.max(12, prev - 2))} title="Smaller Text">A-</button>
                            <button className="icon-btn font-btn" onClick={() => setFontSize(prev => Math.min(72, prev + 2))} title="Larger Text">A+</button>
                        </div>

                        {/* Theme Toggle */}
                        <button className="icon-btn theme-toggle" onClick={toggleTheme} title="Toggle Theme">
                            {theme === 'dark' ? '☀️' : '🌙'}
                        </button>
                        <div className="tooltip-container">
                            <label className="toggle-wrapper">
                                <span>Auto-Insert</span>
                                <input type="checkbox" checked={autoInsert} onChange={toggleAutoInsert} />
                                <div className="toggle-slider"></div>
                            </label>
                            <span className="tooltip-text">Automatically copies text to clipboard when you stop recording</span>
                        </div>
                    </div>
                </header>

                {/* EDITOR CANVAS */}
                <div className="editor-canvas" ref={scrollRef} style={{ fontSize: `${fontSize}px` }}>
                    {/* REACTIONS LAYER */}
                    <div className="reactions-container">
                        {reactions.map(r => (
                            <div
                                key={r.id}
                                className="reaction-emoji"
                                style={{ left: `${r.x}%`, top: `${r.y}%` }}
                            >
                                {r.emoji}
                            </div>
                        ))}
                    </div>

                    {transcript || interimTranscript ? (
                        <div className="text-content" style={{ fontSize: 'inherit' }}>
                            <span className="final">{transcript}</span>
                            <span className="interim">{interimTranscript}</span>
                        </div>
                    ) : (
                        <div className="empty-state">
                            <div className="empty-icon">🎙️</div>
                            <p>Press Space to start dictating</p>
                            <span className="sub">Optimized for continuous speech</span>
                        </div>
                    )}
                </div>

                {/* ACTION BAR */}
                <div className="action-bar">
                    <button className="icon-btn" onClick={clearTranscript} title="Clear">
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>

                    <button className="icon-btn" onClick={handleReadAloud} title="Read Aloud" disabled={!transcript}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M5 3l14 9-14 9V3z" /></svg>
                    </button>

                    <div className="mic-container">
                        <div
                            className={`neural-orb ${isRecording ? 'recording' : ''}`}
                            style={{
                                transform: `scale(${1 + (volume / 100) * 0.5})`,
                                boxShadow: isRecording ? `0 0 ${volume}px var(--accent)` : 'none'
                            }}
                            onClick={toggleRecording}
                        >
                            <span className="mic-icon">🎤</span>
                        </div>
                    </div>

                    <button className="icon-btn" onClick={handleExport} title="Export TXT" disabled={!transcript}>
                        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                    </button>
                </div>

                {/* TOASTS */}
                {(error || statusMessage) && (
                    <div className="toast-container">
                        {error && <div className="toast error">{error}</div>}
                        {statusMessage && <div className="toast info">{statusMessage}</div>}
                        {audioStatus === 'music_noise' && isRecording && <div className="toast warning">⚠️ High noise detected</div>}
                    </div>
                )}
            </main>
        </div>
    );
}

export default App;
