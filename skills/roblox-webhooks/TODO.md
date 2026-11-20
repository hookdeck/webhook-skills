# TODO - Known Issues and Improvements

*Last updated: 2026-11-20*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

None outstanding. The two minor review findings (overclaiming that Roblox's wire
body is compact JSON, and that `JSON.stringify(JSON.parse(raw)) === raw` holds
for compact JSON) were confirmed and fixed in `SKILL.md` and
`references/verification.md` before merge.

## Suggestions

- [ ] Confirm against a live delivery whether the raw body and
      `JSON.stringify(parsed)` forms are byte-identical in practice. The
      examples sign the raw body, which is correct either way, but only a real
      signed Test Response settles what Roblox's sender intends.
- [ ] The wire `EventType` strings for the Subscription, Commerce, Transaction
      Refunded and Early Harm Detection triggers are not published by Roblox.
      Only `RightToErasureRequest`, `SampleNotification` and `AnalyticsAlert`
      are documented. Add cases as real deliveries reveal the names.
- [ ] <https://create.roblox.com/docs/cloud/reference/Subscription> returned
      HTTP 502 to curl when checked on 2026-11-20. Roblox's own webhooks page
      links to it, so it is probably a rendering issue — worth re-checking in a
      browser before relying on it for subscription payload fields.
