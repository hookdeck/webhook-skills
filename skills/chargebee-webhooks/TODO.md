# TODO - Known Issues and Improvements

*Last updated: 2026-02-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/chargebee-webhooks/references/overview.md**: Event name inconsistency: overview.md shows 'subscription_updated' but all code examples use 'subscription_changed'
  - Suggested fix: Change 'subscription_updated' in overview.md line 12 to 'subscription_changed' to match the actual Chargebee event name and code examples

## Suggestions

- [ ] All dependency versions in package.json and requirements.txt have been successfully updated to current stable versions
- [ ] The Basic Auth verification implementation is correct and matches Chargebee's documentation exactly
- [ ] All event type names used in code examples are verified against Chargebee's official documentation
- [ ] The skill structure is complete with all required files present
- [ ] Code quality follows framework best practices for all three implementations

