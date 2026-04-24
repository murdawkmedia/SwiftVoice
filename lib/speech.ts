import type { Quote, SpeechMatchResult, SpeechRecognitionFactory, SpeechRecognitionLike } from '../types';

export type SpeechResultSegment = {
  readonly 0: {
    readonly transcript: string;
  };
};

export type SpeechResultEventLike = {
  readonly results: ArrayLike<SpeechResultSegment>;
};

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionFactory;
    webkitSpeechRecognition?: SpeechRecognitionFactory;
  }
}

export const getSpeechRecognitionFactory = (): SpeechRecognitionFactory | null => {
  if (typeof window === 'undefined') return null;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
};

export const createSpeechRecognition = (
  factory: SpeechRecognitionFactory | null = getSpeechRecognitionFactory(),
): SpeechRecognitionLike | null => {
  return factory ? new factory() : null;
};

export const assembleTranscript = (event: SpeechResultEventLike): string => {
  return Array.from(event.results)
    .map((result) => result[0]?.transcript.trim() ?? '')
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
};

export const normalizeSpeechWord = (word: string): string => {
  return word.toLowerCase().replace(/[^\w\s]/g, '').trim();
};

export const getRandomQuote = (quotes: Quote[], excludeText?: string): Quote => {
  const pool = excludeText ? quotes.filter((candidate) => candidate.text !== excludeText) : quotes;
  const safePool = pool.length > 0 ? pool : quotes;
  return safePool[Math.floor(Math.random() * safePool.length)];
};

export const calculateWpm = (charactersTyped: number, currentInputLength: number, elapsedMs: number): number => {
  if (elapsedMs <= 0) return 0;
  const elapsedMinutes = elapsedMs / 1000 / 60;
  if (elapsedMinutes <= 0) return 0;
  const wpm = (charactersTyped + currentInputLength) / 5 / elapsedMinutes;
  return Number.isFinite(wpm) ? wpm : 0;
};

export const matchSpeechToQuote = (targetText: string, transcript: string): SpeechMatchResult => {
  const targetWords = targetText.split(/\s+/).filter(Boolean);
  const spokenWords = transcript.trim().split(/\s+/).filter(Boolean);

  let matchedWords = 0;

  for (let index = 0; index < spokenWords.length && index < targetWords.length; index += 1) {
    const spoken = normalizeSpeechWord(spokenWords[index]);
    const target = normalizeSpeechWord(targetWords[index]);

    if (spoken && spoken === target) {
      matchedWords += 1;
    } else {
      break;
    }
  }

  const attemptedWords = spokenWords.length;
  const accuracy = attemptedWords === 0 ? 100 : Math.round((matchedWords / attemptedWords) * 100);
  const completed = targetWords.length > 0 && matchedWords === targetWords.length;
  const inputText =
    matchedWords > 0
      ? `${targetWords.slice(0, matchedWords).join(' ')}${completed ? '' : ' '}`
      : '';

  return {
    accuracy,
    attemptedWords,
    completed,
    inputText,
    matchedWords,
    missedWords: Math.max(attemptedWords - matchedWords, 0),
  };
};
