# TODO - Known Issues and Improvements

*Last updated: 2026-11-20*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/roblox-webhooks/references/verification.md**: Line 65 says 'Roblox sends compact JSON, as in its samples', but the samples in Roblox's docs are pretty-printed, so that the wire body is compact is an unverified assumption. SKILL.md line 70 makes the same claim without hedging.
  - Suggested fix: Reword to: 'Assuming Roblox sends compact JSON (unconfirmed; the docs samples are formatted for display), both approaches produce the same bytes...'. Keep the existing note that only a live delivery can settle it.
- [ ] **skills/roblox-webhooks/references/verification.md**: The claim 'For compact JSON, JSON.stringify(JSON.parse(raw)) === raw' is false in general. Escaped characters (\u00e9, \/) and some number formats (1.0, 1e2) normalise differently even in compact JSON. Roblox's AnalyticsAlert sample contains an emoji, so non-ASCII escaping is a realistic case. SKILL.md line 70 ('byte-identical') repeats it.
  - Suggested fix: Qualify it: 'For compact JSON without escaped characters or unusual number formats, the two forms are identical.' Add the non-ASCII/escape case as another reason the raw body is safer.

## Suggestions

- [ ] Update the generator brief/providers notes: AnalyticsAlert is a third documented EventType (https://create.roblox.com/docs/production/analytics/alerts#webhook-delivery), so 'only two wire values' is out of date. The skill already handles it correctly.
- [ ] setup.md 'How Do I Test Locally?' leaves out the docs step 'Select the webhook you want to test from the list' before clicking the pencil icon. It's trivial, but adding it would match the docs exactly.
- [ ] https://create.roblox.com/docs/cloud/reference/Subscription returned HTTP 502 to curl when checked. Roblox's own page links to it, so it's probably a rendering issue, but it's worth re-checking in a browser.

