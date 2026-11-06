import React, { useCallback, useEffect, useRef, useState } from 'react';
import TypingArea from './components/TypingArea';
import StatsOverlay from './components/StatsOverlay';
import { DEFAULT_QUOTES, DURATIONS } from './constants';
import {
  assembleTranscript,
  calculateWpm,
  createSpeechRecognition,
  getRandomQuote,
  getSpeechRecognitionFactory,
  matchSpeechToQuote,
} from './lib/speech';
import { TestStatus, TypingStats, TestConfig, Quote, SpeechRecognitionLike } from './types';

type MicState = 'idle' | 'requesting' | 'ready' | 'denied' | 'unavailable' | 'error';

const initialStats = (): TypingStats => ({
  wpm: 0,
  accuracy: 100,
  charactersTyped: 0,
  wordsAttempted: 0,
  incorrectWords: 0,
  timeTaken: 0,
});

const getUnsupportedMessage = (): string => {
  const userAgent = navigator.userAgent;
  if (/Firefox/i.test(userAgent)) {
    return 'Speech recognition is not available in Firefox. SwiftVoice works best in Chrome or Edge.';
  }
  if (/Safari/i.test(userAgent) && !/(Chrome|CriOS|Edg)/i.test(userAgent)) {
    return 'Speech recognition is not available in this Safari session. Try Chrome or Edge, or enable Safari speech recognition support if your version provides it.';
  }
  return 'Speech recognition is not available in this browser. SwiftVoice works best in Chrome or Edge.';
};

const App: React.FC = () => {
  const [isDark, setIsDark] = useState(true);
  const [status, setStatus] = useState<TestStatus>(TestStatus.IDLE);
  const [config, setConfig] = useState<TestConfig>({ duration: 30 });
  const [quote, setQuote] = useState<Quote>(DEFAULT_QUOTES[0]);
  const [userInput, setUserInput] = useState('');
  const [timeLeft, setTimeLeft] = useState(config.duration);
  const [isListening, setIsListening] = useState(false);
  const [micState, setMicState] = useState<MicState>(() =>
    getSpeechRecognitionFactory() ? 'idle' : 'unavailable',
  );
  const [message, setMessage] = useState<string | null>(() =>
    getSpeechRecognitionFactory() ? null : getUnsupportedMessage(),
  );
  const [sessionStats, setSessionStats] = useState<TypingStats>(initialStats);

  const timerRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const configRef = useRef(config);
  const statsRef = useRef(sessionStats);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRestartRef = useRef(false);
  const generationRef = useRef(0);
  const restartTimeoutRef = useRef<number | null>(null);
  const transcriptRef = useRef({ previous: '', current: '' });
  const completedWordsRef = useRef({ attempted: 0, missed: 0 });
  const advancingRef = useRef(false);

  const latestRef = useRef({
    quote,
    status,
    userInput,
  });

  useEffect(() => {
    statsRef.current = sessionStats;
  }, [sessionStats]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  latestRef.current = { quote, status, userInput };

  const stopRecognition = useCallback(() => {
    advancingRef.current = false;
    generationRef.current += 1;
    if (restartTimeoutRef.current !== null) {
      window.clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    shouldRestartRef.current = false;
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      recognition.onstart = recognition.onend = recognition.onresult = recognition.onerror = null;
      try {
        recognition.stop();
      } catch {
        // Browser recognition objects can throw when already stopped.
      }
    }
  }, []);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const finishTest = useCallback(() => {
    if (latestRef.current.status !== TestStatus.RUNNING) return;
    latestRef.current.status = TestStatus.FINISHED;
    const partial = latestRef.current.userInput.trimEnd();
    const elapsedMs = Date.now() - (startTimeRef.current ?? Date.now());
    setSessionStats((previous) => ({
      ...previous,
      charactersTyped: previous.charactersTyped + partial.length,
      wpm: calculateWpm(previous.charactersTyped, partial.length, elapsedMs),
      timeTaken: elapsedMs / 1000 / 60,
    }));
    shouldRestartRef.current = false;
    clearTimer();
    stopRecognition();
    setIsListening(false);
    setStatus(TestStatus.FINISHED);
  }, [clearTimer, stopRecognition]);

  const startTimer = useCallback(() => {
    if (timerRef.current) return;

    startTimeRef.current = Date.now();
    latestRef.current.status = TestStatus.RUNNING;
    setStatus(TestStatus.RUNNING);
    const duration = configRef.current.duration;
    setTimeLeft(duration);

    timerRef.current = window.setInterval(() => {
      const remaining = Math.max(0, Math.ceil(duration - (Date.now() - startTimeRef.current!) / 1000));
      setTimeLeft(remaining);
      if (remaining === 0) finishTest();
    }, 1000);
  }, [finishTest]);

  const resetTest = useCallback(
    (newDuration?: number, currentQuoteText?: string) => {
      clearTimer();
      stopRecognition();

      const duration = newDuration ?? config.duration;
      latestRef.current.status = TestStatus.IDLE;
      transcriptRef.current = { previous: '', current: '' };
      completedWordsRef.current = { attempted: 0, missed: 0 };
      setStatus(TestStatus.IDLE);
      setUserInput('');
      setIsListening(false);
      setTimeLeft(duration);
      setQuote(getRandomQuote(DEFAULT_QUOTES, currentQuoteText));
      setMessage(getSpeechRecognitionFactory() ? null : getUnsupportedMessage());
      setMicState(getSpeechRecognitionFactory() ? 'idle' : 'unavailable');
      setSessionStats(initialStats());
      startTimeRef.current = null;
    },
    [clearTimer, config.duration, stopRecognition],
  );

  const failStart = useCallback((nextMessage: string, state: MicState = 'error') => {
    clearTimer();
    stopRecognition();
    latestRef.current.status = TestStatus.IDLE;
    setStatus(TestStatus.IDLE);
    setIsListening(false);
    setMicState(state);
    setMessage(nextMessage);
    startTimeRef.current = null;
  }, [clearTimer, stopRecognition]);

  const handleSpeechInput = useCallback((transcript: string) => {
    const currentQuote = latestRef.current.quote;
    if (latestRef.current.status !== TestStatus.RUNNING || !shouldRestartRef.current) return;

    const result = matchSpeechToQuote(currentQuote.text, transcript);
    const attempted = completedWordsRef.current.attempted + result.attemptedWords;
    const missed = completedWordsRef.current.missed + result.missedWords;
    const accuracy = attempted === 0 ? 100 : Math.round((attempted - missed) / attempted * 100);

    setSessionStats((previous) => ({
      ...previous,
      accuracy,
      wordsAttempted: attempted,
      incorrectWords: missed,
    }));

    setUserInput(result.inputText);

    if (!result.completed) return;
    completedWordsRef.current = { attempted, missed };

    setSessionStats((previous) => ({
      ...previous,
      charactersTyped: previous.charactersTyped + result.inputText.length,
      accuracy,
      wordsAttempted: attempted,
      incorrectWords: missed,
    }));
    setUserInput('');

    shouldRestartRef.current = false;
    advancingRef.current = true;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // Safe to ignore a stopped recognizer when advancing quotes.
      }
    }

    transcriptRef.current = { previous: '', current: '' };
    const nextQuote = getRandomQuote(DEFAULT_QUOTES, currentQuote.text);
    latestRef.current.quote = nextQuote;
    setQuote(nextQuote);

  }, [failStart]);

  const startTest = () => {
    if (latestRef.current.status !== TestStatus.IDLE) return;
    let recognition: SpeechRecognitionLike | null;
    try { recognition = createSpeechRecognition(); }
    catch { failStart('Failed to start speech recognition. Reload the page and try again.'); return; }
    if (!recognition) {
      failStart(getUnsupportedMessage(), 'unavailable');
      return;
    }

    setMessage(null);
    const generation = ++generationRef.current;
    const isCurrent = () => generation === generationRef.current && recognitionRef.current === recognition;
    recognitionRef.current = recognition;
    transcriptRef.current = { previous: '', current: '' };
    completedWordsRef.current = { attempted: 0, missed: 0 };
    setSessionStats(initialStats());
    setUserInput('');
    latestRef.current.status = TestStatus.STARTING;
    setMicState('requesting');
    setStatus(TestStatus.STARTING);
    setIsListening(false);
    shouldRestartRef.current = true;

    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onresult = (event: unknown) => {
      if (!isCurrent()) return;
      transcriptRef.current.current = assembleTranscript(event as Parameters<typeof assembleTranscript>[0]);
      handleSpeechInput([transcriptRef.current.previous, transcriptRef.current.current].filter(Boolean).join(' '));
    };

    recognition.onerror = (event) => {
      if (!isCurrent()) return;
      switch (event.error) {
        case 'not-allowed':
        case 'permission-denied':
        case 'service-not-allowed':
          failStart(
            'Microphone access was denied. Allow microphone access in your browser settings and try again.',
            'denied',
          );
          break;
        case 'audio-capture':
          failStart('No microphone was detected. Connect a microphone and try again.', 'error');
          break;
        case 'network':
          failStart(
            'The browser speech service reported a network error. Some browsers use provider-hosted recognition.',
          );
          break;
        case 'no-speech':
        case 'aborted':
          break;
        default:
          failStart('Speech recognition stopped unexpectedly. Try restarting the test.');
          break;
      }
    };

    recognition.onstart = () => {
      if (!isCurrent()) return;
      setMicState('ready');
      setIsListening(true);
      startTimer();
    };

    recognition.onend = () => {
      if (!isCurrent()) return;
      if (advancingRef.current && latestRef.current.status === TestStatus.RUNNING) {
        advancingRef.current = false;
        restartTimeoutRef.current = window.setTimeout(() => {
          restartTimeoutRef.current = null;
          if (!isCurrent() || latestRef.current.status !== TestStatus.RUNNING) return;
          shouldRestartRef.current = true;
          try { recognition.start(); }
          catch { failStart('Speech recognition could not resume. Restart the test to try again.'); }
        }, 150);
        return;
      }
      if (shouldRestartRef.current && latestRef.current.status === TestStatus.RUNNING) {
        transcriptRef.current.previous = [transcriptRef.current.previous, transcriptRef.current.current].filter(Boolean).join(' ');
        transcriptRef.current.current = '';
        try {
          recognition.start();
        } catch {
          failStart('Speech recognition could not resume. Restart the test to try again.');
        }
      } else if (latestRef.current.status === TestStatus.STARTING) {
        failStart('Speech recognition stopped before it was ready. Try starting again.');
      }
    };

    try {
      recognition.start();
    } catch {
      failStart('Failed to start speech recognition. Reload the page and try again.');
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
      stopRecognition();
    };
  }, [clearTimer, stopRecognition]);

  useEffect(() => {
    if (status !== TestStatus.RUNNING || !startTimeRef.current) return;

    const interval = window.setInterval(() => {
      if (latestRef.current.status !== TestStatus.RUNNING) return;
      const elapsedMs = Date.now() - startTimeRef.current!;
      setSessionStats((previous) => ({
        ...previous,
        timeTaken: elapsedMs / 1000 / 60,
        wpm: calculateWpm(statsRef.current.charactersTyped, userInput.length, elapsedMs),
      }));
    }, 250);

    return () => window.clearInterval(interval);
  }, [status, userInput.length]);

  const isUnsupported = micState === 'unavailable';
  const isBusy = status === TestStatus.STARTING || status === TestStatus.RUNNING;
  const themeClass = isDark ? 'bg-[#161617] text-[#f5f5f7]' : 'bg-[#fbfbfd] text-[#1d1d1f]';
  const navClass = isDark ? 'bg-black/70 border-white/10' : 'bg-white/70 border-gray-200/50';
  const messageClass =
    micState === 'unavailable'
      ? isDark ? 'border-amber-500/30 bg-amber-500/10 text-amber-300' : 'border-amber-600/30 bg-amber-50 text-amber-900'
      : isDark ? 'border-red-500/30 bg-red-500/10 text-red-300' : 'border-red-600/30 bg-red-50 text-red-800';

  return (
    <div className={`min-h-screen flex flex-col transition-colors duration-500 ${themeClass}`}>
      <nav className={`apple-blur sticky top-0 z-50 px-4 py-4 border-b transition-colors duration-500 ${navClass}`}>
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center space-x-2">
            <img src="/swiftvoice/logo.png" alt="SwiftVoice logo" className="w-10 h-10 rounded-xl" />
            <h1 className="text-xl font-medium">SwiftVoice</h1>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-3">
            <div
              className={`flex p-1 rounded-full border transition-colors duration-300 ${
                isDark ? 'bg-white/5 border-white/10' : 'bg-gray-100/80 border-gray-200'
              }`}
              aria-label="Test duration"
            >
              {DURATIONS.map((duration) => (
                <button
                  key={duration}
                  type="button"
                  aria-pressed={config.duration === duration}
                  onClick={() => {
                    setConfig({ duration });
                    resetTest(duration, quote.text);
                  }}
                  className={`px-4 py-1.5 text-xs font-medium rounded-full transition-all duration-200 ${
                    config.duration === duration
                      ? isDark
                        ? 'bg-white text-black'
                        : 'bg-white shadow-sm text-blue-600'
                      : isDark
                        ? 'text-gray-400 hover:text-white'
                        : 'text-gray-500 hover:text-gray-900'
                  }`}
                >
                  {duration}s
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={() => setIsDark((current) => !current)}
              aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
              className={`p-2 rounded-full border transition-all duration-300 hover:scale-110 active:scale-95 ${
                isDark ? 'bg-white/10 border-white/20 text-yellow-400' : 'bg-gray-100 border-gray-200 text-gray-600'
              }`}
            >
              {isDark ? (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.46 4.95l.7.7a1 1 0 001.42-1.41l-.71-.7a1 1 0 00-1.41 1.41zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </nav>

      <main className="flex-grow flex flex-col items-center justify-center px-6 py-12 max-w-5xl mx-auto w-full">
        {message && (
          <div
            data-testid={isUnsupported ? 'unsupported-message' : 'speech-error'}
            className={`w-full max-w-2xl mb-8 p-5 rounded-2xl border text-sm text-center ${messageClass}`}
            role="alert"
          >
            <p className="font-semibold mb-1">{isUnsupported ? 'Browser Not Supported' : 'Speech Recognition Notice'}</p>
            <p>{message}</p>
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
            isActive={isBusy}
            isDark={isDark}
          />
          <span data-testid="progress-text" className="sr-only">
            {userInput}
          </span>

          <div className="mt-4 min-h-12 flex items-center">
            {status === TestStatus.IDLE && (
              <button
                data-testid="start-button"
                type="button"
                onClick={startTest}
                disabled={isUnsupported}
                className={`px-8 py-3 rounded-full font-medium transition-all duration-300 transform hover:scale-105 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:scale-100 ${
                  isDark ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' : 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                }`}
              >
                Start Speaking
              </button>
            )}

            {status === TestStatus.STARTING && (
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-amber-400 rounded-full" />
                <span className={isDark ? 'text-white' : 'text-black'}>Starting...</span>
              </div>
            )}

            {status === TestStatus.RUNNING && (
              <div className="flex items-center space-x-2 animate-pulse" data-testid="listening-indicator">
                <div className="w-3 h-3 bg-red-500 rounded-full" />
                <span className={isDark ? 'text-white' : 'text-black'}>Listening...</span>
              </div>
            )}
          </div>

          <div className={`mt-8 text-center font-light transition-colors duration-300 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>
            - {quote.author}
          </div>
        </div>

        <div className="mt-16 flex flex-col items-center">
          {status === TestStatus.FINISHED && (
            <div
              data-testid="results-card"
              className={`mb-8 p-8 rounded-3xl shadow-xl transition-all duration-500 border ${
                isDark ? 'bg-white/5 border-white/10 shadow-black/50' : 'bg-white border-gray-100 shadow-gray-200/50'
              } flex flex-col items-center max-w-md w-full`}
            >
              <h2 className={`text-2xl font-medium mb-6 ${isDark ? 'text-white' : 'text-gray-900'}`}>Test Results</h2>
              <div className="grid grid-cols-2 gap-8 w-full">
                <div className="text-center">
                  <p className="text-sm text-gray-400 uppercase mb-1">Speed</p>
                  <p className={`text-4xl font-light ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>{Math.round(sessionStats.wpm)} WPM</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-400 uppercase mb-1">Accuracy</p>
                  <p className={`text-4xl font-light ${isDark ? 'text-white' : 'text-gray-800'}`}>{Math.round(sessionStats.accuracy)}%</p>
                </div>
              </div>
              <div className="mt-6 pt-6 border-t border-gray-500/10 w-full text-center space-y-1">
                <p className="text-xs text-gray-500 uppercase">Characters: {sessionStats.charactersTyped}</p>
                <p className="text-xs text-gray-500 uppercase">Missed words: {sessionStats.incorrectWords}</p>
              </div>
            </div>
          )}

          {(status === TestStatus.FINISHED || status === TestStatus.RUNNING || status === TestStatus.STARTING) && (
            <button
              data-testid="restart-button"
              type="button"
              onClick={() => resetTest(undefined, quote.text)}
              className={`group flex items-center space-x-2 px-8 py-3 rounded-full transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] shadow-lg ${
                isDark ? 'bg-white text-black hover:bg-gray-100 shadow-white/5' : 'bg-gray-900 text-white hover:bg-black shadow-gray-300'
              }`}
            >
              <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" className={`h-5 w-5 transition-transform duration-500 ${status === TestStatus.FINISHED ? 'rotate-180' : 'group-hover:rotate-180'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.58m15.36 2A8 8 0 004.58 9M4.58 9H9m11 11v-5h-.58m0 0a8 8 0 01-15.36-2m15.36 2H15" />
              </svg>
              <span className="font-medium">Restart Test</span>
            </button>
          )}

          <p className="mt-4 text-xs text-gray-500 uppercase">
            Use Restart Test to reset
          </p>
        </div>

        <div
          className={`mt-12 max-w-2xl text-center text-xs leading-relaxed px-4 py-3 rounded-2xl border ${
            isDark ? 'border-green-500/20 bg-green-500/5 text-green-300/80' : 'border-green-600/20 bg-green-50 text-green-800/80'
          }`}
        >
          SwiftVoice has no backend, no accounts, no API keys, and no Murdawk data collection. Speech recognition behavior depends on your browser.
        </div>
      </main>

      <footer className={`py-8 border-t transition-colors duration-500 ${isDark ? 'border-white/5' : 'border-gray-100'}`}>
        <div className="max-w-5xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500">
          <div className="flex flex-col md:flex-row items-center space-y-2 md:space-y-0 md:space-x-4">
            <p>(c) 2026 SwiftVoice. Voice Speed Trainer.</p>
            <div className="flex items-center space-x-1.5">
              <span>Created by:</span>
              <a
                href="https://www.murdawkmedia.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`transition-colors duration-300 font-medium ${isDark ? 'text-gray-400 hover:text-white' : 'text-gray-500 hover:text-black'}`}
              >
                Murdawk Media
              </a>
            </div>
          </div>
          <p className="text-xs italic opacity-50 mt-4 md:mt-0">Free, static, and browser-native.</p>
        </div>
      </footer>

    </div>
  );
};

export default App;
