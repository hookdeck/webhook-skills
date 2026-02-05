# TODO - Known Issues and Improvements

*Last updated: 2026-02-04*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/vercel-webhooks/references/overview.md**: The 'attack.detected' event is included but marked as potentially requiring specific plans or security features. Without official documentation confirmation, this could mislead users
  - Suggested fix: Either verify this event exists in Vercel's documentation or remove it entirely to avoid confusion

### Minor

- [ ] **skills/vercel-webhooks/examples/express/package.json**: Using Express 5.x (^5.2.1) which is newer. Most production apps still use Express 4.x
  - Suggested fix: Consider using Express ^4.21.2 for broader compatibility, or add a note about Express 5.x being used
- [ ] **skills/vercel-webhooks/examples/nextjs/package.json**: Next.js version 16.1.6 doesn't exist. The latest stable version is around 14.x or 15.x
  - Suggested fix: Use a valid Next.js version like ^14.2.0 or ^15.0.0

## Suggestions

- [ ] Consider adding rate limiting recommendations in the documentation for production deployments
- [ ] The webhook security documentation could mention that the signature verification details are based on common patterns, as Vercel's official docs don't explicitly detail the verification method
- [ ] Consider adding a note about webhook retry behavior and idempotency handling best practices

