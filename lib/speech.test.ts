import { describe, expect, it, vi } from 'vitest';
import { assembleTranscript, calculateWpm, getRandomQuote, matchSpeechToQuote } from './speech';

describe('assembleTranscript', () => {
  it('joins result segments with spaces', () => {
    const transcript = assembleTranscript({
      results: [
        [{ transcript: ' hello ' }],
        [{ transcript: 'world' }],
      ],
    });

    expect(transcript).toBe('hello world');
  });

  it('collapses empty and whitespace-only result segments', () => {
    const transcript = assembleTranscript({
      results: [
        [{ transcript: 'Move fast,' }],
        [{ transcript: '  ' }],
        [{ transcript: 'break things.' }],
      ],
    });

    expect(transcript).toBe('Move fast, break things.');
  });
});

describe('matchSpeechToQuote', () => {
  it('matches words while preserving quote punctuation in the rendered input', () => {
    const result = matchSpeechToQuote('Talk is cheap. Show me the code.', 'talk is cheap');

    expect(result).toMatchObject({
      accuracy: 100,
      attemptedWords: 3,
      completed: false,
      inputText: 'Talk is cheap. ',
      matchedWords: 3,
      missedWords: 0,
    });
  });

  it('tracks mismatch accuracy even when no words match', () => {
    const result = matchSpeechToQuote('Talk is cheap.', 'banana phone');

    expect(result).toMatchObject({
      accuracy: 0,
      attemptedWords: 2,
      completed: false,
      inputText: '',
      matchedWords: 0,
      missedWords: 2,
    });
  });

  it('marks a quote complete when all words match', () => {
    const result = matchSpeechToQuote('Stay hungry, stay foolish.', 'stay hungry stay foolish');

    expect(result).toMatchObject({
      accuracy: 100,
      completed: true,
      inputText: 'Stay hungry, stay foolish.',
      matchedWords: 4,
    });
  });
});

describe('calculateWpm', () => {
  it('guards against NaN and Infinity before time has elapsed', () => {
    expect(calculateWpm(10, 10, 0)).toBe(0);
    expect(Number.isFinite(calculateWpm(10, 10, 1))).toBe(true);
  });
});

describe('getRandomQuote', () => {
  it('excludes the current quote when alternatives exist', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const quote = getRandomQuote(
      [
        { text: 'first', author: 'A' },
        { text: 'second', author: 'B' },
      ],
      'first',
    );

    expect(quote.text).toBe('second');
  });
});
