# SwiftVoice releases

Canonical app: https://www.murdawkmedia.com/swiftvoice/

SwiftVoice is an independent static app imported into the existing
`murdawk-media` Cloudflare Workers asset deployment. Nostr main is authoritative;
GitHub is a passive mirror. No separate Worker, DNS record or backend is needed.
Standalone Pages is not a release target. Retire its existing project only after
verifying the new URL and preserving its exact release for recovery.

## Build and import

From the reviewed SwiftVoice source, using Node 22 or newer:

```sh
npm ci --ignore-scripts
npm run typecheck
npm test
npm run build
npm run test:e2e
```

The dev server and build use `/swiftvoice/`. Browser tests mock speech and need
Playwright Chromium; use `SWIFTVOICE_TEST_PORT` for an available local port.
No test requests a real microphone.

From the studio website checkout:

```sh
node scripts/import-swiftvoice.mjs /path/to/reviewed-swiftvoice/dist
npm test
npx tsc --noEmit
npm run build
```

Review `public/swiftvoice/`, `apps/swiftvoice-release.json` and the scoped
`public/_headers` blocks. The imported app is retained with the website so future
website builds need neither the SwiftVoice checkout nor its dependencies. Keep
both source histories separate. The importer preserves sibling app policies and
refuses to replace a changed policy without review.

With the approved release and existing Murdawk credentials, deploy the website:

```sh
wrangler deploy --keep-vars
```

## Acceptance and recovery

Verify all served files and types, canonical/apex/slash redirects, Lab entry,
scoped CSP and microphone policies, desktop/mobile prompt progression, automatic
recognition restarts, cancellation, denied/network error recovery, timer results,
accuracy across quotes, themes and Tab focus. Recheck SwiftType and the studio.
Mock speech checks do not establish real device/browser/provider acceptance.

Preserve `Cache-Control: public, no-transform` for `/swiftvoice/*` so the studio
analytics beacon is not injected. Keep unrelated site and SwiftType policies
intact. Do not weaken the CSP to admit analytics.

Retain source bundles, an independently restored release, prior Worker version
and exact old public assets before retiring Pages. Future repairs must preserve
both hosted apps in the combined website build. Keep private source notes,
credentials, raw logs and local environment files out of the public repository
and all deployed assets.
