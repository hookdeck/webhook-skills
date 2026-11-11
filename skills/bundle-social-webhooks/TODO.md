# TODO - Known Issues and Improvements

*Last updated: 2026-11-10*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

None outstanding. The one review finding — `references/verification.md` presenting
the SDK's `verifySignature` as a public boolean helper — was confirmed against
`bundlesocial@2.70.0` (`dist/index.d.ts` declares it `private`) and has been fixed:
`constructEvent` is now documented as the only public entry point.

## Suggestions

- [ ] The Express and Next.js examples use the SDK's `constructEvent`, which compares with `===` and is not constant-time. The skill and `references/verification.md` both say so, but consider also pointing to the manual `timingSafeEqual` snippet in a comment in each Node example.
- [ ] bundle.social's own DM-docs example names the variable `BUNDLE_WEBHOOK_SECRET`. Consider noting in `setup.md` that `BUNDLE_SOCIAL_WEBHOOK_SECRET` is this repo's convention, so users porting the official example aren't confused.
