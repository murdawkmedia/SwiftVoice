# Cloudflare Pages releases

Live app: https://swiftvoice.pages.dev/

Nostr main is authoritative; GitHub is a passive distribution mirror with
Actions disabled. Preserve the existing Cloudflare Pages project and its master
production branch label. Git-triggered production and preview builds are paused;
release the accepted Nostr checkout directly with Wrangler.

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run test:e2e
wrangler pages deploy dist --project-name swiftvoice --branch master --commit-hash "$(git rev-parse HEAD)" --commit-dirty=false
```

Begin with a clean accepted checkout and use privately configured Cloudflare
authentication. The browser suite needs Chromium for Playwright and mocks speech;
it does not request real microphone access. Never copy ignored local environment
files, credentials or raw logs into source or the deployed dist directory.

Verify provider release SHA and every served asset, then desktop/mobile speech
progression, microphone/error controls and restart behavior with synthetic speech.
Actual microphone and browser speech-provider acceptance remains browser-dependent.
Keep the previous deployment ID and verified source bundle for rollback. Preserve
existing browser origin and any independent historical branches/local variants.
