# TODO - Known Issues and Improvements

*Last updated: 2026-11-12*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

*No open issues: the one minor review finding (the "returns a 500" wording in
references/verification.md) was verified against the live docs and corrected.*

## Suggestions

- [ ] verification.md / example comments: note that the docs' reference check is one-sided (rejects only when age > maxAge, so future timestamps pass). The examples' symmetric |now - t| check is a deliberate tightening, and clock skew on the receiver can make it reject.
- [ ] overview.md: the wallets page scopes at-least-once delivery to events fired within the monitoring window (3 minutes on EVM, 2 minutes on Solana). Worth one line.
- [ ] overview.md: the Solana wallet example has no `address` field. The handlers log `body.address`, which prints undefined on Solana. Consider noting it or picking `address` defensively.
- [ ] overview.md: the multi-address page says wallet.activity.multi is ERC-20 only ('Native ETH transfers are not currently supported'). Worth adding next to the raw-value note.
- [ ] overview.md: the Customers webhooks page says the Customers API is available only to select partners during onboarding (US individual KYC). A short caveat would stop readers expecting it by default.
- [ ] examples/nextjs/vitest.config.ts: Vite warns about ESM syntax in a file loaded as CommonJS. Rename to vitest.config.mts or add "type": "module" to package.json to silence it.

