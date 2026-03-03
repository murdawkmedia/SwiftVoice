import React, { useState, useEffect, useCallback, useRef } from 'react';
import TypingArea from './components/TypingArea';
import StatsOverlay from './components/StatsOverlay';
import { TestStatus, TypingStats, TestConfig, Quote } from './types';
import { DEFAULT_QUOTES, DURATIONS } from './constants';

// ---------------------------------------------------------------------------
// Web Speech API type augmentation
// ---------------------------------------------------------------------------
declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

// ---------------------------------------------------------------------------
// Browser support detection (run once, not in render)
// ---------------------------------------------------------------------------
const getSpeechRecognitionClass = (): any | null => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
};

const isMobile = (): boolean =>
  /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------
type MicState = 'idle' | 'requesting' | 'denied' | 'unavailable' | 'ready';

const App: React.FC = () => {
  // Theme
  const [isDark, setIsDark] = useState(true);

  // Test state
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [config, setConfig] = useState<TestConfig>({ duration: 30 });
  const [quote, setQuote] = useState<Quote>(DEFAULT_QUOTES[0]);
  const [userInput, setUserInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(config.duration);
  const [isListening, setIsListening] = useState(false);

  // Microphone / browser support state
  const [micState, setMicState] = useState<MicState>(() =>
    getSpeechRecognitionClass() ? 'idle' : 'unavailable'
  );
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Cumulative stats for the whole test session
  const [sessionStats, setSessionStats] = useState<TypingStats>({
    wpm: 0,
    accuracy: 100,
    charactersTyped: 0,
    totalKeystrokes: 0,
    incorrectKeystrokes: 0,
    timeTaken: 0,
  });

  // Refs
  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const statsRef = useRef(sessionStats);
  const recognitionRef = useRef<any>(null);

  // Controls whether onend should auto-restart recognition.
  // Set to false when we intentionally stop (test finish, quote complete, reset).
  const shouldRestartRef = useRef(false);

  // Ref to hold latest state/handlers to avoid stale closures in recognition event listeners
  const latestRef = useRef({
    status,
    isListening,
    quote,
    sessionStats,
    handleSpeechInput: (_val: string) => {},
  });

  // Keep statsRef in sync
  useEffect(() => {
    statsRef.current = sessionStats;
  }, [sessionStats]);

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  const getRandomQuote = useCallback((excludeText?: string): Quote => {
    const pool = excludeText
      ? DEFAULT_QUOTES.filter((q) => q.text !== excludeText)
      : DEFAULT_QUOTES;
    return pool[Math.floor(Math.random() * pool.length)];
  }, []);

  // ---------------------------------------------------------------------------
  // finishTest
  // ---------------------------------------------------------------------------
  const finishTest = useCallback(() => {
    shouldRestartRef.current = false;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch (_) {}
    }
    setIsListening(false);
    setStatus(TestStatus.FINISHED);
  }, []);

  // ---------------------------------------------------------------------------
  // resetTest
  // ---------------------------------------------------------------------------
  const resetTest = useCallback(
    (newDuration?: number, currentQuoteText?: string) => {
      shouldRestartRef.current = false;
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }

      const d = newDuration ?? config.duration;
      setStatus(TestStatus.IDLE);
      setUserInput('');
      setIsListening(false);
      setTimeLeft(d);
      setQuote(getRandomQuote(currentQuoteText));
      setErrorMessage(null);
      setSessionStats({
        wpm: 0,
        accuracy: 100,
        charactersTyped: 0,
        totalKeystrokes: 0,
        incorrectKeystrokes: 0,
        timeTaken: 0,
      });
      startTimeRef.current = null;
    },
    [config.duration, getRandomQuote]
  );

  // ---------------------------------------------------------------------------
  // handleSpeechInput — word-level matching
  // ---------------------------------------------------------------------------
  const handleSpeechInput = useCallback(
    (value: string) => {
      const currentQuote = latestRef.current.quote;
      if (latestRef.current.status === TestStatus.FINISHED) return;

      // Normalize: lowercase, strip punctuation
      const normalize = (str: string) => str.toLowerCase().replace(/[^\w\s]/g, '');

      const targetWords = currentQuote.text.split(' ');
      const spokenWords = value.trim().split(/\s+/);

      let matchedWordCount = 0;
      let spokenWordCount = 0;

      // Count how many spoken words match the beginning of targetWords
      for (let i = 0; i < spokenWords.length && i < targetWords.length; i++) {
        const spoken = normalize(spokenWords[i]);
        const target = normalize(targetWords[i]);
        spokenWordCount++;
        if (spoken === target) {
          matchedWordCount++;
        } else {
          // Stop matching — first mismatch breaks the streak
          break;
        }
      }

      // Accuracy = correct / attempted (words we tried to match)
      const attemptedWords = Math.max(spokenWordCount, 1);
      const accuracy = Math.round((matchedWordCount / attemptedWords) * 100);

      if (matchedWordCount > 0) {
        // Reconstruct input from original target words (preserves punctuation)
        const constructedInput =
          targetWords.slice(0, matchedWordCount).join(' ') +
          (matchedWordCount < targetWords.length ? ' ' : '');

        setSessionStats((prev) => ({
          ...prev,
          accuracy: Math.min(accuracy, 100),
          totalKeystrokes: constructedInput.length,
          incorrectKeystrokes: spokenWordCount - matchedWordCount,
        }));

        setUserInput(constructedInput);

        // All words matched — quote complete
        if (matchedWordCount === targetWords.length) {
          setSessionStats((prev) => ({
            ...prev,
            charactersTyped: prev.charactersTyped + constructedInput.length,
          }));

          setUserInput('');

          // Prevent onend from restarting — we'll restart after switching quote
          shouldRestartRef.current = false;
          if (recognitionRef.current) {
            try { recognitionRef.current.stop(); } catch (_) {}
          }

          // Switch to next quote and restart recognition
          const nextQuote = getRandomQuote(currentQuote.text);
          setQuote(nextQuote);

          // Brief delay so the browser recognition stop completes, then restart
          setTimeout(() => {
            if (latestRef.current.status === TestStatus.RUNNING && recognitionRef.current) {
              shouldRestartRef.current = true;
              try { recognitionRef.current.start(); } catch (_) {}
            }
          }, 150);
        }
      }
    },
    [getRandomQuote]
  );

  // Update latestRef every render so speech callbacks always have fresh data
  useEffect(() => {
    latestRef.current = {
      status,
      isListening,
      quote,
      sessionStats,
      handleSpeechInput,
    };
  });

  // ---------------------------------------------------------------------------
  // startTest
  // ---------------------------------------------------------------------------
  const startTest = () => {
    const SpeechRecognition = getSpeechRecognitionClass();
    if (!SpeechRecognition) {
      setMicState('unavailable');
      return;
    }

    setErrorMessage(null);
    setMicState('requesting');
    setStatus(TestStatus.RUNNING);
    startTimeRef.current = Date.now();
    setIsListening(true);
    shouldRestartRef.current = true;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: any) => {
      // Concatenate all results (including interim) into one transcript
      const currentTranscript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');

      latestRef.current.handleSpeechInput(currentTranscript);
    };

    recognition.onerror = (event: any) => {
      console.error('Speech recognition error:', event.error);

      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
          setMicState('denied');
          setErrorMessage(
            'Microphone access was denied. Please allow microphone access in your browser settings and try again.'
          );
          shouldRestartRef.current = false;
          finishTest();
          break;

        case 'no-speech':
          // Silence timeout — not fatal, onend will restart
          break;

        case 'audio-capture':
          setErrorMessage(
            'No microphone detected. Please connect a microphone and try again.'
          );
          shouldRestartRef.current = false;
          finishTest();
          break;

        case 'network':
          // Some browsers route speech through a server; this app targets fully local,
          // but if the browser requires a network call, surface a clear message.
          setErrorMessage(
            'A network error occurred with the speech service. Please check your connection.'
          );
          break;

        case 'aborted':
          // Intentional stop — ignore
          break;

        default:
          console.warn('Unhandled speech error:', event.error);
          break;
      }
    };

    recognition.onstart = () => {
      setMicState('ready');
    };

    recognition.onend = () => {
      // Auto-restart on silence timeout or brief interruption — but only if test is still running
      if (shouldRestartRef.current && latestRef.current.status === TestStatus.RUNNING) {
        try {
          recognition.start();
        } catch (_) {
          // Already started or stopped — ignore
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch (e) {
      console.error('Failed to start speech recognition:', e);
      setErrorMessage('Failed to start the microphone. Please reload and try again.');
      setStatus(TestStatus.IDLE);
      setIsListening(false);
      shouldRestartRef.current = false;
    }

    timerRef.current = window.setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          finishTest();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  // ---------------------------------------------------------------------------
  // Cleanup on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try { recognitionRef.current.stop(); } catch (_) {}
      }
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Real-time WPM calculation
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (status !== TestStatus.RUNNING || !startTimeRef.current) return;

    const updateWpm = () => {
      const timeElapsedSec = (Date.now() - startTimeRef.current!) / 1000;
      const timeElapsedMin = timeElapsedSec / 60;

      // WPM = (all finished-quote chars + current partial chars) / 5 / minutes
      const totalChars = statsRef.current.charactersTyped + userInput.length;
      const currentWpm = timeElapsedMin > 0 ? totalChars / 5 / timeElapsedMin : 0;

      setSessionStats((prev) => ({
        ...prev,
        wpm: currentWpm,
        timeTaken: timeElapsedMin,
      }));
    };

    const interval = setInterval(updateWpm, 250);
    return () => clearInterval(interval);
  }, [status, userInput.length, sessionStats.charactersTyped]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------
  const themeClass = isDark ? 'bg-[#161617] text-[#f5f5f7]' : 'bg-[#fbfbfd] text-[#1d1d1f]';
  const navClass = isDark
    ? 'bg-black/70 border-white/10'
    : 'bg-white/70 border-gray-200/50';

  const isUnsupported = micState === 'unavailable';
  const isMicDenied = micState === 'denied';
  const mobile = isMobile();

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${themeClass}`}>
      {/* ------------------------------------------------------------------ */}
      {/* Nav                                                                  */}
      {/* ------------------------------------------------------------------ */}
      <nav
        className={`apple-blur sticky top-0 z-50 px-6 py-4 border-b transition-colors duration-500 ${navClass}`}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <img src="/logo.png" alt="SwiftVoice Logo" className="w-10 h-10 rounded-xl" />
            <h1 className="text-xl font-medium tracking-tight">SwiftVoice</h1>
          </div>

          <div className="flex items-center space-x-6">
            {/* Duration selector */}
            <div
              className={`flex p-1 rounded-full border transition-colors duration-300 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100/80 border-gray-200'
              }`}
            >
              {DURATIONS.map((d) => (
                <button
                  key={d}
                  onClick={() => {
                    setConfig({ duration: d });
                    resetTest(d, quote.text);
                  }}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                    config.duration === d
                      ? isDark
                        ? 'bg-white text-black'
                        : 'bg-white shadow-sm text-blue-600'
                      : isDark
                      ? 'text-gray-400 hover:text-white'
                      : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {d}s
                </button>
              ))}
            </div>

            {/* Dark/light toggle */}
            <button
              onClick={() => setIsDark(!isDark)}
              className={`p-2 rounded-full border transition-all duration-300 hover:scale-110 active:scale-95 ${
                isDark
                  ? 'bg-white/10 border-white/20 text-yellow-400'
                  : 'bg-gray-100 border-gray-200 text-gray-600'
              }`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path
                    fillRule="evenodd"
                    d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* ------------------------------------------------------------------ */}
      {/* Main                                                                 */}
      {/* ------------------------------------------------------------------ */}
      <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 max-w-5xl mx-auto w-full">

        {/* Browser not supported banner */}
        {isUnsupported && (
          <div className="w-full max-w-2xl mb-8 p-5 rounded-2xl border border-amber-500/30 bg-amber-500/10 text-amber-400 text-sm text-center">
            <p className="font-semibold mb-1">⚠️ Browser Not Supported</p>
            <p>
              The Web Speech API is not available in your browser. SwiftVoice works best in{' '}
              <strong>Chrome</strong> or <strong>Edge</strong>.{' '}
              {/Safari/i.test(navigator.userAgent) && !/(Chrome|CriOS)/i.test(navigator.userAgent)
                ? 'Safari support is limited — try enabling "Web Speech Recognition" in Safari › Settings › Advanced › Experimental Features.'
                : 'Firefox does not support the Web Speech API.'}
            </p>
          </div>
        )}

        {/* Mic denied / error banner */}
        {errorMessage && (
          <div className="w-full max-w-2xl mb-8 p-5 rounded-2xl border border-red-500/30 bg-red-500/10 text-red-400 text-sm text-center">
            <p className="font-semibold mb-1">🎙️ Microphone Error</p>
            <p>{errorMessage}</p>
            {isMicDenied && (
              <p className="mt-2 text-xs opacity-75">
                In Chrome: click the lock icon in the address bar → allow Microphone.
                In Safari: Settings → Websites → Microphone → Allow.
              </p>
            )}
          </div>
        )}

        <StatsOverlay
          wpm={sessionStats.wpm}
          accuracy={sessionStats.accuracy}
          timeLeft={timeLeft}
          isDark={isDark}
        />

        <div className="w-full relative min-h-[300px] flex flex-col items-center justify-center">
          <TypingArea
            targetText={quote.text}
            userInput={userInput}
            isFinished={status === TestStatus.FINISHED}
            isActive={status === TestStatus.RUNNING}
            isDark={isDark}
          />

          <div className="mt-4">
            {status === TestStatus.IDLE && (
              <button
                onClick={startTest}
                disabled={isUnsupported}
                className={`px-8 py-3 rounded-full font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  isDark
                    ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30'
                    : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                }`}
              >
                🎙️ Start Speaking
              </button>
            )}

            {status === TestStatus.RUNNING && (
              <div className="flex items-center space-x-2 animate-pulse">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <span className={isDark ? 'text-white' : 'text-black'}>Listening…</span>
              </div>
            )}
          </div>

          <div
            className={`mt-8 text-center font-light transition-colors duration-300 ${
              isDark ? 'text-gray-500' : 'text-gray-400'
            }`}
          >
            — {quote.author}
          </div>
        </div>

        {/* Results + Restart */}
        <div className="mt-16 flex flex-col items-center">
          {status === TestStatus.FINISHED && (
            <div
              className={`mb-8 p-8 rounded-3xl shadow-xl transition-all duration-500 border ${
                isDark
                  ? 'bg-white/5 border-white/10 shadow-black/50'
                  : 'bg-white border-gray-100 shadow-gray-200/50'
              } flex flex-col items-center max-w-md w-full`}
            >
              <h2 className={`text-2xl font-medium mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                Test Results
              </h2>
              <div className="grid grid-cols-2 gap-8 w-full">
                <div className="text-center">
                  <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">Speed</p>
                  <p className={`text-4xl font-light ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>
                    {Math.round(sessionStats.wpm)} WPM
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-400 uppercase tracking-widest mb-1">Accuracy</p>
                  <p className={`text-4xl font-light ${isDark ? 'text-white' : 'text-gray-800'}`}>
                    {Math.round(sessionStats.accuracy)}%
                  </p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-500/10 w-full text-center">
                <p className="text-xs text-gray-500 uppercase tracking-widest">
                  Total Characters: {sessionStats.charactersTyped}
                </p>
              </div>
            </div>
          )}

          {(status === TestStatus.FINISHED || status === TestStatus.RUNNING) && (
            <button
              onClick={() => resetTest(undefined, quote.text)}
              className={`group flex items-center space-x-2 px-8 py-3 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg ${
                isDark
                  ? 'bg-white text-black hover:bg-gray-100 shadow-white/5'
                  : 'bg-gray-900 text-white hover:bg-black shadow-gray-300'
              }`}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className={`h-5 w-5 transition-transform duration-500 ${
                  status === TestStatus.FINISHED ? 'rotate-180' : 'group-hover:rotate-180'
                }`}
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              <span className="font-medium">Restart Test</span>
            </button>
          )}

          <p className="mt-4 text-xs text-gray-500 uppercase tracking-widest">
            {mobile ? 'Tap Restart to reset' : 'Press Tab to reset'}
          </p>
        </div>

        {/* Privacy notice */}
        <div
          className={`mt-12 flex items-center space-x-2 text-xs px-4 py-2 rounded-full border ${
            isDark
              ? 'border-green-500/20 bg-green-500/5 text-green-400/70'
              : 'border-green-600/20 bg-green-50 text-green-700/70'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
            <path
              fillRule="evenodd"
              d="M2.166 4.999A11.954 11.954 0 0010 1.944 11.954 11.954 0 0017.834 5c.11.65.166 1.32.166 2.001 0 5.225-3.34 9.67-8 11.317C5.34 16.67 2 12.225 2 7c0-.682.057-1.35.166-2.001zm11.541 3.708a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clipRule="evenodd"
            />
          </svg>
          <span>100% private — all speech processing happens locally in your browser. No audio ever leaves your device.</span>
        </div>
      </main>

      {/* ------------------------------------------------------------------ */}
      {/* Footer                                                               */}
      {/* ------------------------------------------------------------------ */}
      <footer
        className={`py-8 border-t transition-colors duration-500 ${
          isDark ? 'border-white/5' : 'border-gray-100'
        }`}
      >
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
          <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4">
            <p>&copy; 2026 SwiftVoice. Pure Focus Voice.</p>
            <div className="flex items-center space-x-1.5">
              <span>Created by:</span>
              <a
                href="https://www.murdawkmedia.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`transition-colors duration-300 font-medium ${
                  isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'
                }`}
              >
                Murdawk Media
              </a>
            </div>
          </div>
          <p className="text-xs italic opacity-50 mt-4 md:mt-0">
            Inspired by tech pioneers, from 1980 to today.
          </p>
        </div>
      </footer>

      <GlobalKeyListener onReset={() => resetTest(undefined, quote.text)} />
    </div>
  );
};

// ---------------------------------------------------------------------------
// Global keyboard listener (Tab = reset)
// ---------------------------------------------------------------------------
const GlobalKeyListener: React.FC<{ onReset: () => void }> = ({ onReset }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        onReset();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onReset]);
  return null;
};

export default App;
