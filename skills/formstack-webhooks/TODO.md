# TODO - Known Issues and Improvements

*Last updated: 2026-09-25*

These items were identified during authoring and review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Resolved

- [x] **Digest algorithm and encoding confirmed by live capture (2026-09-25).** Formstack's
  public documentation still does not name them, but two real WebHook deliveries were
  captured and recomputed: HMAC-SHA256 over the raw urlencoded body, lowercase hex,
  `sha256=`-prefixed, keyed with the HMAC Key used directly. The base64 form does not match.
  The second delivery was signed after the key changed and verified only with the new key.
  The "if hex never matches, try base64" troubleshooting step has been removed, and the
  captured delivery is now a test vector in all three example suites.
- [x] **Live delivery verified against a real Formstack account.** See above. The same
  captures confirmed `FormID` and `UniqueID` as strings, showed that the Shared Secret
  arrives as a body field named `HandshakeKey`, and showed a
  `FormstackWebhook/1.0 (Form <FormID>)` user-agent.

### Minor

- [ ] **The payload envelope beyond `FormID`, `UniqueID` and `HandshakeKey` is deliberately
  not enumerated.** Every other key in a Formstack body is the form's own field label, so
  there is no fixed schema to document. The skill points at
  `GET /forms/{formId}/webhooks/openapi` as the honest per-form answer. Do not add a
  speculative envelope field list.
- [ ] **Only urlencoded deliveries have been captured.** The JSON content type is
  documented, and the examples handle it, but no JSON delivery has been recomputed yet. A
  JSON capture would confirm the key order and that the signature covers the JSON bytes as
  sent.
- [ ] **Unobserved: a delivery from a WebHook with no Shared Secret.** Both captures had one
  set, so whether `HandshakeKey` is omitted or sent empty without one is unknown. The skill
  says so rather than asserting either.
- [ ] **The `HandshakeKey` field name and the user-agent are observed, not documented.**
  They come from two deliveries on one account. Revisit if Formstack documents either.

## Suggestions

- [ ] The FastAPI example emits a `StarletteDeprecationWarning` ("Using httpx with
  starlette.testclient is deprecated; install httpx2 instead") under the pinned versions.
  Harmless today, and repo-wide rather than specific to this skill.

- [ ] The Next.js example's `vitest.config.ts` triggers a Vite warning about ESM syntax in a
  CommonJS-loaded file. Adding `"type": "module"` to `nextjs/package.json` (or renaming the
  config to `.mts`) would silence it. Also a repo-wide pattern.
