# TODO - Known Issues and Improvements

*Last updated: 2026-11-12*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/coinbase-webhooks/references/verification.md**: Says the docs' Node sample 'calls Buffer.from(providedSignature, 'hex') with no length check, so a malformed or odd-length signature makes it throw and return a 500.' In the official sample on /webhooks/verify-signatures, the timingSafeEqual call is inside a try block whose catch logs and returns false, so a malformed signature produces a 400, not a 500.
  - Suggested fix: Reword to: 'Node's timingSafeEqual throws on buffers of unequal length. The docs' sample relies on a surrounding try/catch to turn that into `false`. Validating `/^[0-9a-f]{64}$/i` up front is clearer and avoids using exceptions for control flow.' Keep the existing validation in the code.

## Suggestions

- [ ] verification.md / example comments: note that the docs' reference check is one-sided (rejects only when age > maxAge, so future timestamps pass). The examples' symmetric |now - t| check is a deliberate tightening, and clock skew on the receiver can make it reject.
- [ ] overview.md: the wallets page scopes at-least-once delivery to events fired within the monitoring window (3 minutes on EVM, 2 minutes on Solana). Worth one line.
- [ ] overview.md: the Solana wallet example has no `address` field. The handlers log `body.address`, which prints undefined on Solana. Consider noting it or picking `address` defensively.
- [ ] overview.md: the multi-address page says wallet.activity.multi is ERC-20 only ('Native ETH transfers are not currently supported'). Worth adding next to the raw-value note.
- [ ] overview.md: the Customers webhooks page says the Customers API is available only to select partners during onboarding (US individual KYC). A short caveat would stop readers expecting it by default.
- [ ] examples/nextjs/vitest.config.ts: Vite warns about ESM syntax in a file loaded as CommonJS. Rename to vitest.config.mts or add "type": "module" to package.json to silence it.

