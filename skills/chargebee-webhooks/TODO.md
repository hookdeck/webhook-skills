# TODO - Known Issues and Improvements

*Last updated: 2026-02-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/chargebee-webhooks/examples/express/src/index.js**: Using incorrect event names. The reference implementation uses 'payment_succeeded' but the code uses 'payment_initiated' and 'payment_collection_failed' which are not documented
  - Suggested fix: Replace 'payment_initiated' with 'payment_succeeded' and remove 'payment_collection_failed' unless verified against Chargebee API docs
- [ ] **skills/chargebee-webhooks/references/overview.md**: Inconsistent event names between overview.md (uses 'payment_succeeded' and 'payment_failed') and implementations (use 'payment_initiated' and 'payment_collection_failed')
  - Suggested fix: Use consistent event names across all files. Based on the reference implementation, 'payment_succeeded' is correct

### Minor

- [ ] **skills/chargebee-webhooks/SKILL.md**: The warning note about verifying event types is good but could be more prominent since payment events appear to have incorrect names
  - Suggested fix: Move the warning to the top of the event types section and specifically call out that payment event names need verification
- [ ] **skills/chargebee-webhooks/examples/express/src/index.js**: Express example doesn't use express.raw() for raw body access even though the SKILL.md shows it in comments
  - Suggested fix: Either remove the express.raw() example from SKILL.md or explain why it's not needed for Basic Auth (unlike HMAC signatures)

