# TODO - Known Issues and Improvements

*Last updated: 2026-07-24*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [x] **skills/airwallex-webhooks/references/setup.md**: The secret placeholder uses a `whsec_` prefix (`AIRWALLEX_WEBHOOK_SECRET=whsec_xxxxx`), which is a Svix/Stripe convention. Airwallex webhook secrets have no `whsec_` prefix — the official docs describe no prefix. This is also internally inconsistent: verification.md explicitly states there is 'no `whsec_`-decoding step.' The same misleading placeholder appears in SKILL.md (line 77), setup.md (lines 27), and all three .env.example files (express/nextjs/fastapi: `whsec_your_webhook_secret_here`). It does not break verification (no code strips a prefix) but misrepresents the provider's secret format.
  - Suggested fix: Replace the `whsec_`-prefixed placeholders with a neutral, prefix-free placeholder in all five locations, e.g. `AIRWALLEX_WEBHOOK_SECRET=your_webhook_secret_here` in the .env.example files and `AIRWALLEX_WEBHOOK_SECRET=your_endpoint_secret` in SKILL.md line 77 and setup.md line 27.

## Suggestions

- [ ] Optional: the Express example uses `express.raw({ type: '*/*' })` rather than the `application/json` type from the checklist. This is a deliberate, more-robust choice (captures the raw body regardless of Content-Type), so it is fine — but a one-line comment noting why `*/*` is used would preempt reviewer questions.
- [x] Consider a brief note in setup.md that the `x-signature` header is only sent when the webhook is configured with a secret (per the official docs), so an unsigned endpoint cannot be verified.

