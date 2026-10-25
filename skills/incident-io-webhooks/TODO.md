# TODO - Known Issues and Improvements

*Last updated: 2026-10-25*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/incident-io-webhooks/SKILL.md**: The inline verification snippet (line 46) decodes a whsec_ secret with Buffer.from(..., 'base64') without the base64-alphabet check that every example's secretToKey has, even though the prose at line 64 says the hand-written version 'rejects a whsec_ value that isn't valid base64'. It also matches the version tag with startsWith('v1,') while the examples use indexOf(',') plus an exact 'v1' comparison; the result is the same, but the code isn't identical.
  - Suggested fix: Copy the example's secretToKey logic into the snippet (check /^[A-Za-z0-9+/]+={0,2}$/ on the part after whsec_ before decoding, and reject an empty key), and use the same comma-split, exact-'v1' entry parsing as examples/express/src/index.js.

## Suggestions

- [ ] In references/setup.md, mention that Settings → Webhooks can send test events and retry failed deliveries (stated on docs.incident.io/api-reference/webhooks). It's a simpler way to test locally than declaring a test incident.
- [ ] Optionally add one cross-check test that verifies a signature produced by the standardwebhooks/svix reference library, so the tests don't only check the hand-written code against itself.

