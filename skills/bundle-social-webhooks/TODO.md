# TODO - Known Issues and Improvements

*Last updated: 2026-11-10*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/bundle-social-webhooks/references/verification.md**: Says `bundle.webhooks.verifySignature(body, signature, secret)` returns a boolean, but bundlesocial@2.70.0 declares verifySignature as `private` in dist/index.d.ts and the SDK docs only document constructEvent. Calling it from TypeScript fails to compile, so it should not be presented as public API.
  - Suggested fix: Remove the verifySignature sentence (line 36), or say it is a private method and recommend constructEvent or the manual HMAC check instead.

## Suggestions

- [ ] The Express and Next.js examples use the SDK's constructEvent, which compares with === and is not constant-time. The skill already says so, but consider also pointing to the manual timingSafeEqual snippet in a comment in each Node example.
- [ ] bundle.social's own DM-docs example names the variable BUNDLE_WEBHOOK_SECRET. Consider noting in setup.md that BUNDLE_SOCIAL_WEBHOOK_SECRET is this repo's convention, so users porting the official example aren't confused.
- [ ] Consider citing the Direct Messages webhooks page (https://info.bundle.social/api-reference/direct-messages/webhooks.md) in verification.md as the official source for the hex-over-raw-body scheme, because the main webhooks page doesn't spell it out.

