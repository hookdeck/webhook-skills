# TODO - Known Issues and Improvements

*Last updated: 2026-07-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/gocardless-webhooks/references/overview.md**: The payouts `bounced` action (overview.md line 95, and the corresponding branches in express/src/index.js:132, nextjs/app/webhooks/gocardless/route.ts:106, and fastapi/main.py:99) could not be verified against GoCardless documentation. The reconciling-payouts docs and the webhook appendix list payout actions as `paid`, `fx_rate_confirmed`, and `tax_exchange_rates_confirmed`; `bounced` does not appear. It only affects a log-only default branch, so there is no functional impact, but it is a documented event-name accuracy nit.
  - Suggested fix: Verify `payouts.bounced` against the official appendix-webhooks reference. If it does not exist, remove the `bounced` branch and consider documenting the verified FX-related payout actions (`fx_rate_confirmed`, `tax_exchange_rates_confirmed`) instead.

## Suggestions

- [ ] Everything else is accurate and internally consistent — signature verification (SDK + manual), event names, files, dependency versions, env vars, endpoint path, and tests all check out.
- [ ] The 498 'Invalid Token' status is non-standard HTTP but is genuinely what GoCardless's own docs use, so it is correct to keep; a one-line note in verification.md explaining 'any non-2xx triggers a retry' already covers readers who find 498 surprising.

