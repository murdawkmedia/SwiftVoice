import { expect, test, type Page } from '@playwright/test';

const firstQuote = 'Design is not just what it looks like and feels like. Design is how it works.';

const blockThirdPartyRequests = async (page: Page) => {
  const externalRequests: string[] = [];
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('http://127.0.0.1:3000/') || url === 'http://127.0.0.1:3000') {
      await route.continue();
      return;
    }
    externalRequests.push(url);
    await route.abort();
  });
  return externalRequests;
};

const installMockSpeechRecognition = async (page: Page) => {
  await page.addInitScript(() => {
    type MockInstance = {
      onend: (() => void) | null;
      onerror: ((event: { error: string }) => void) | null;
      onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null;
      onstart: (() => void) | null;
      start: () => void;
      stop: () => void;
    };

    const instances: MockInstance[] = [];

    class MockSpeechRecognition implements MockInstance {
      continuous = false;
      interimResults = false;
      lang = '';
      onend: (() => void) | null = null;
      onerror: ((event: { error: string }) => void) | null = null;
      onresult: ((event: { results: Array<Array<{ transcript: string }>> }) => void) | null = null;
      onstart: (() => void) | null = null;

      constructor() {
        instances.push(this);
      }

      start() {
        this.onstart?.();
      }

      stop() {
        this.onend?.();
      }
    }

    Object.assign(window, {
      SpeechRecognition: MockSpeechRecognition,
      webkitSpeechRecognition: MockSpeechRecognition,
      __swiftVoiceEmitResult: (segments: string[]) => {
        const instance = instances.at(-1);
        instance?.onresult?.({
          results: segments.map((transcript) => [{ transcript }]),
        });
      },
      __swiftVoiceEmitError: (error: string) => {
        const instance = instances.at(-1);
        instance?.onerror?.({ error });
      },
    });
  });
};

test('loads without third-party runtime requests', async ({ page }) => {
  await installMockSpeechRecognition(page);
  const externalRequests = await blockThirdPartyRequests(page);

  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'SwiftVoice' })).toBeVisible();
  expect(externalRequests).toEqual([]);
});

test('advances spoken text with a mocked speech recognizer', async ({ page }) => {
  await installMockSpeechRecognition(page);
  await page.goto('/');

  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('listening-indicator')).toBeVisible();

  await page.evaluate(() => {
    window.__swiftVoiceEmitResult([' Design ', 'is']);
  });
  await expect(page.getByTestId('progress-text')).toHaveText('Design is ');

  await page.evaluate((quote) => {
    window.__swiftVoiceEmitResult([quote]);
  }, firstQuote);

  await expect(page.getByTestId('progress-text')).toHaveText('');
  await expect(page.getByTestId('quote-text')).not.toContainText(firstQuote);
});

test('shows unsupported browser state without touching the microphone', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true });
  });

  await page.goto('/');

  await expect(page.getByTestId('unsupported-message')).toBeVisible();
  await expect(page.getByTestId('start-button')).toBeDisabled();
});

test('handles microphone permission denial inline', async ({ page }) => {
  await installMockSpeechRecognition(page);
  await page.goto('/');

  await page.getByTestId('start-button').click();
  await page.evaluate(() => {
    window.__swiftVoiceEmitError('not-allowed');
  });

  await expect(page.getByTestId('speech-error')).toContainText('Microphone access was denied');
  await expect(page.getByTestId('results-card')).toHaveCount(0);
  await expect(page.getByTestId('start-button')).toBeVisible();
});

test('finishes on timer and resets with Tab', async ({ page }) => {
  await page.clock.install();
  await installMockSpeechRecognition(page);
  await page.goto('/');

  await page.getByRole('button', { name: '15s' }).click();
  await expect(page.getByLabel('15 seconds remaining')).toBeVisible();
  await page.getByTestId('start-button').click();
  await expect(page.getByTestId('listening-indicator')).toBeVisible();

  await page.clock.runFor(16_000);
  await expect(page.getByTestId('results-card')).toBeVisible();

  await page.keyboard.press('Tab');
  await expect(page.getByTestId('start-button')).toBeVisible();
  await expect(page.getByTestId('results-card')).toHaveCount(0);
});

test('toggles theme accessibly', async ({ page }) => {
  await installMockSpeechRecognition(page);
  await page.goto('/');

  await page.getByRole('button', { name: 'Switch to light mode' }).click();
  await expect(page.getByRole('button', { name: 'Switch to dark mode' })).toBeVisible();
});

test.describe('mobile copy', () => {
  test.use({
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
    viewport: { width: 390, height: 844 },
  });

  test('uses tap-oriented reset copy', async ({ page }) => {
    await installMockSpeechRecognition(page);
    await page.goto('/');

    await expect(page.getByText('Tap Restart to reset')).toBeVisible();
  });
});
