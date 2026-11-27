# TODO - Known Issues and Improvements

*Last updated: 2026-11-27*

These items were identified during review but are acceptable for merge.
Contributions to address these items are welcome.

## Resolved

- [x] The payouts `bounced` action wasn't a GoCardless event. The branches that
  handled it were removed from the three examples, and overview.md now lists the
  documented payout actions (`paid`, `paid_again`, `fx_rate_confirmed`,
  `tax_exchange_rates_confirmed`). A bounced payout is reported as
  `creditors` / `bounced_payout`.
- [x] Retries: GoCardless's webhooks reference documents automatic retries (9
  delivery attempts in all, at increasing intervals) and that a `498` is logged
  and not retried. The earlier "GoCardless does not auto-retry" wording was
  corrected on 2026-11-27.
- [x] The webhooks reference now names the signature algorithm (HMAC SHA256, hex
  digest of the raw body).

## Suggestions

- [ ] The 498 'Invalid Token' status is non-standard HTTP but is genuinely what
  GoCardless's own docs use, so it is correct to keep.
