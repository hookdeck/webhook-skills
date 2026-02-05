# TODO - Known Issues and Improvements

*Last updated: 2026-02-05*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Critical

None - Postmark correctly uses URL-based authentication instead of signature verification, which matches the official documentation.

### Major

None - Inbound and SMTP API Error event types are documented in overview.md.

### Minor

- [ ] **skills/postmark-webhooks/examples/nextjs/package.json**: Next.js version 16.1.6 doesn't exist. Latest stable is 15.x
  - Suggested fix: Change next version to ^15.1.6 or latest 15.x version

