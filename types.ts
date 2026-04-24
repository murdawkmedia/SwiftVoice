
export enum TestStatus {
  IDLE = 'IDLE',
  STARTING = 'STARTING',
  RUNNING = 'RUNNING',
  FINISHED = 'FINISHED'
}

export interface TypingStats {
  wpm: number;
  accuracy: number;
  charactersTyped: number;
  wordsAttempted: number;
  incorrectWords: number;
  timeTaken: number;
}

export interface TestConfig {
  duration: number; // in seconds
}

export interface Quote {
  text: string;
  author: string;
}

export interface SpeechRecognitionErrorEventLike {
  error: 'aborted' | 'audio-capture' | 'network' | 'no-speech' | 'not-allowed' | 'permission-denied' | string;
}

export interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: unknown) => void) | null;
  onstart: (() => void) | null;
  start: () => void;
  stop: () => void;
}

export interface SpeechRecognitionFactory {
  new (): SpeechRecognitionLike;
}

export interface SpeechMatchResult {
  accuracy: number;
  attemptedWords: number;
  completed: boolean;
  inputText: string;
  matchedWords: number;
  missedWords: number;
}
