# TODO - Known Issues and Improvements

*Last updated: 2026-02-04*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **All example implementations**: Missing handlers for several GitLab webhook event types that are documented: feature_flag, emoji, milestone, access_token, vulnerability events. While the code has a default handler, these documented events should have specific handlers.
  - Suggested fix: Add specific handlers for feature_flag, emoji, milestone, access_token, and vulnerability events in all three framework examples.

### Minor

- [ ] **skills/gitlab-webhooks/examples/nextjs/app/webhooks/gitlab/route.ts**: Next.js route is in app/webhooks/gitlab/ while other examples use /webhooks/gitlab endpoint directly. This is structurally correct for Next.js App Router but worth noting.
  - Suggested fix: No fix needed - this is the correct structure for Next.js App Router.
- [ ] **skills/gitlab-webhooks/SKILL.md**: The SKILL.md file mentions Issue events but doesn't explicitly mention work_item events which are handled together with issues.
  - Suggested fix: Update the event table to clarify that issue handler also covers work_item events.

## Suggestions

- [ ] Consider adding more details about GitLab's webhook retry behavior and how the Idempotency-Key header can be used for deduplication
- [ ] The documentation could mention GitLab's branch/tag filtering options available in webhook configuration
- [ ] Consider documenting the difference between Group webhooks vs Project webhooks

