<div align="center">
<img width="1200" height="475" alt="SwiftVoice banner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SwiftVoice

SwiftVoice is a free, static, browser-native voice speed trainer. It has no SwiftVoice backend, no accounts, no API keys, and no Murdawk Media data collection.

Speech recognition is provided by the user's browser through the Web Speech API. Browser behavior varies: some browsers can use local or platform recognition, while others may use provider-hosted speech services. See the [MDN Web Speech API guide](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API) for the browser-level privacy details.

## Features

- Voice-driven prompt progression
- Real-time WPM and accuracy tracking
- Dark and light modes
- 15s, 30s, 60s, and 120s tests
- Inline browser and microphone error handling

## Browser Compatibility

| Browser | Support | Notes |
| --- | --- | --- |
| Chrome and Edge | Best | Web Speech API support is strongest on Chromium browsers. |
| Safari | Partial | Support varies by version and settings. |
| Firefox | Not supported | Firefox does not currently expose speech recognition for this app. |

## Run Locally

**Prerequisites:** Node.js 20+

```bash
npm install
npm run dev
```

Open the local Vite URL printed by the command.

## Quality Checks

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

End-to-end tests mock the browser speech-recognition API and do not access a real microphone.
