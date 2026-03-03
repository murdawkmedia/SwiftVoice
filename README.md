<div align="center">
<img width="1200" height="475" alt="SwiftVoice Banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SwiftVoice — Voice Speed Trainer

A minimalist, **privacy-first** voice typing trainer powered entirely by the browser's built-in [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API).

> **🔒 100% Private.** No audio is ever sent to a server. All speech-to-text processing happens locally in your browser. No account, no API keys, no data collection.

## Features

- 🎙️ **Voice-driven** — speak the on-screen text to advance, no keyboard required
- ⚡ **Real-time WPM + accuracy** tracking
- 🌙 **Dark / Light mode**
- ⏱️ **Multiple test durations** — 15s, 30s, 60s, 120s
- 📴 **Works offline** — no external speech service calls
- 📱 **Mobile-friendly** — works on Chrome for Android and iOS Safari (with limitations)

## Browser Compatibility

| Browser | Support | Notes |
|---------|---------|-------|
| Chrome (desktop/Android) | ✅ Full | Best experience |
| Edge (desktop) | ✅ Full | Chromium-based |
| Safari (macOS/iOS 14.5+) | ⚠️ Partial | Enable via Settings › Advanced › Experimental Features |
| Firefox | ❌ Not supported | Web Speech API not implemented |

## Run Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Install dependencies
npm install

# 2. Start development server
npm run dev

# 3. Open http://localhost:3000
```

No API keys or environment variables required — this app uses zero external services.

## Build for Production

```bash
npm run build
# Output in ./dist — deploy to any static host (Cloudflare Pages, Netlify, Vercel, etc.)
```

## Privacy

SwiftVoice uses the browser's native [`SpeechRecognition`](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition) API. In **Chrome and Edge**, this is processed entirely on-device using the browser's built-in speech engine. In **Safari**, recognition is handled by Apple's on-device APIs.

No audio data is ever transmitted to Murdawk Media or any third-party server.

## Created by

[Murdawk Media](https://www.murdawkmedia.com)
