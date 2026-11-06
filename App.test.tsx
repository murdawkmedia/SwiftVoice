import React from 'react';
import { act, fireEvent, render, screen, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import type { SpeechRecognitionLike } from './types';

class MockRecognition implements SpeechRecognitionLike {
  static instances: MockRecognition[] = [];
  continuous = true;
  interimResults = true;
  lang = '';
  onend: SpeechRecognitionLike['onend'] = null;
  onerror: SpeechRecognitionLike['onerror'] = null;
  onresult: SpeechRecognitionLike['onresult'] = null;
  onstart: SpeechRecognitionLike['onstart'] = null;
  constructor() { MockRecognition.instances.push(this); }
  start() { this.onstart?.(); }
  stop() { this.onend?.(); }
  emit(transcript: string) { this.onresult?.({ results: [[{ transcript }]] }); }
}

beforeEach(() => { MockRecognition.instances = []; window.SpeechRecognition = MockRecognition; });
afterEach(() => { cleanup(); vi.useRealTimers(); delete window.SpeechRecognition; });

describe('voice session lifecycle', () => {
  it('preserves normal Tab navigation', () => {
    render(<App />);
    expect(fireEvent.keyDown(window, { key: 'Tab' })).toBe(true);
  });

  it('ignores a delayed recognizer start after a duration reset', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    const delayedStart = MockRecognition.instances[0].onstart!;
    fireEvent.click(screen.getByRole('button', { name: '15s' }));
    act(() => { delayedStart(); });
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
    expect(screen.queryByTestId('listening-indicator')).not.toBeInTheDocument();
  });

  it('allows retry after a speech provider network failure', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    act(() => { MockRecognition.instances[0].onerror?.({ error: 'network' }); });
    expect(screen.getByTestId('start-button')).toBeInTheDocument();
    expect(screen.getByTestId('speech-error')).toHaveTextContent('network');
  });

  it('includes partial spoken characters in final results', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    act(() => { MockRecognition.instances[0].emit('Design is'); });
    act(() => { vi.advanceTimersByTime(30_000); });
    expect(screen.getByTestId('results-card')).toHaveTextContent('Characters: 9');
  });

  it('uses elapsed time after a delayed timer tick', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    vi.setSystemTime(Date.now() + 60_000);
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.getByTestId('results-card')).toBeInTheDocument();
  });

  it('keeps progress when the browser restarts recognition mid-quote', () => {
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    const recognition = MockRecognition.instances[0];
    act(() => { recognition.emit('Design is'); });
    act(() => { recognition.onend?.(); });
    act(() => { recognition.emit('not just'); });
    expect(screen.getByTestId('progress-text')).toHaveTextContent('Design is not just');
  });

  it('keeps accuracy and missed words across completed quotes', () => {
    vi.useFakeTimers();
    render(<App />);
    const firstQuote = screen.getByTestId('quote-text').textContent!;
    const words = firstQuote.split(/\s+/).length;
    fireEvent.click(screen.getByTestId('start-button'));
    act(() => { MockRecognition.instances[0].emit(firstQuote + ' nonsense'); });
    act(() => { vi.advanceTimersByTime(150); });
    const nextWord = screen.getByTestId('quote-text').textContent!.split(/\s+/)[0];
    act(() => { MockRecognition.instances[0].emit(nextWord); });
    expect(screen.getByLabelText(`${Math.round((words + 1) / (words + 2) * 100)} percent accuracy`)).toBeInTheDocument();
  });

  it('waits for recognition to end before starting the next quote', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByTestId('start-button'));
    const recognition = MockRecognition.instances[0];
    const start = vi.spyOn(recognition, 'start');
    vi.spyOn(recognition, 'stop').mockImplementation(() => {});
    act(() => { recognition.emit(screen.getByTestId('quote-text').textContent!); });
    act(() => { vi.advanceTimersByTime(200); });
    expect(start).not.toHaveBeenCalled();
    act(() => { recognition.onend?.(); vi.advanceTimersByTime(150); });
    expect(start).toHaveBeenCalledTimes(1);
  });
});
