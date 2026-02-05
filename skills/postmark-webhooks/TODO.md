# TODO - Known Issues and Improvements

*Last updated: 2026-02-05*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Critical

- [ ] **skills/postmark-webhooks/SKILL.md**: The documentation correctly states that Postmark does NOT use signature verification, which aligns with the official documentation. However, the review checklist's focus on signature verification is misleading for this provider.
  - Suggested fix: No fix needed - the implementation is correct. The review checklist should note that some providers don't use signature verification.

### Major

- [ ] **skills/postmark-webhooks/references/overview.md**: Missing 'Inbound' and 'SMTP API Error' webhook event types that are listed in Postmark's official documentation
  - Suggested fix: Add documentation for 'Inbound' and 'SMTP API Error' webhook types to the overview and examples

### Minor

- [ ] **skills/postmark-webhooks/examples/nextjs/package.json**: Next.js version 16.1.6 doesn't exist. Latest stable is 15.x
  - Suggested fix: Change next version to ^15.1.6 or latest 15.x version

