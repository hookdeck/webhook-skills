# TODO - Known Issues and Improvements

*Last updated: 2026-02-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Critical

- [ ] **skills/chargebee-webhooks/examples/express/package.json**: Express version is significantly outdated - using ^4.21.0 when current stable is 5.2.1
  - Suggested fix: Update to "express": "^5.2.1"
- [ ] **skills/chargebee-webhooks/examples/express/package.json**: Jest version is outdated - using ^29.0.0 when current stable is 30.2.0
  - Suggested fix: Update to "jest": "^30.2.0"
- [ ] **skills/chargebee-webhooks/examples/nextjs/package.json**: Next.js version is outdated - using ^15.1.0 when current stable is 16.1.6
  - Suggested fix: Update to "next": "^16.1.6"
- [ ] **skills/chargebee-webhooks/examples/nextjs/package.json**: Vitest version is significantly outdated - using ^2.1.0 when current stable is 4.0.18
  - Suggested fix: Update to "vitest": "^4.0.18"
- [ ] **skills/chargebee-webhooks/examples/fastapi/requirements.txt**: FastAPI version is outdated - using >=0.115.0 when current stable is 0.128.0
  - Suggested fix: Update to "fastapi>=0.128.0"
- [ ] **skills/chargebee-webhooks/examples/fastapi/requirements.txt**: pytest version is outdated - using >=8.0.0 when current stable is 9.0.2
  - Suggested fix: Update to "pytest>=9.0.2"
- [ ] **skills/chargebee-webhooks/examples/fastapi/requirements.txt**: httpx version is outdated - using >=0.27.0 when current stable is 0.28.1
  - Suggested fix: Update to "httpx>=0.28.1"

### Major

- [ ] **skills/chargebee-webhooks/SKILL.md**: Event names 'payment_succeeded' and 'payment_failed' could not be verified against Chargebee documentation. These were already flagged in TODO.md as potentially incorrect
  - Suggested fix: Verify exact event names against Chargebee API documentation - they may be 'payment_source_added', 'payment_source_updated', or other names
- [ ] **skills/chargebee-webhooks/references/overview.md**: Overview uses 'subscription_updated' but examples use 'subscription_changed' - inconsistent event names
  - Suggested fix: Use consistent event names across all files. Based on the code, 'subscription_changed' appears to be correct

### Minor

- [ ] **skills/chargebee-webhooks/SKILL.md**: Express example in SKILL.md shows express.raw() in comments but it's not needed for Basic Auth
  - Suggested fix: Remove the express.raw() comment example as it's confusing and not relevant to Basic Auth verification

