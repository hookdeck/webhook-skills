# TODO - Known Issues and Improvements

*Last updated: 2026-02-04*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Critical

- [ ] **skills/paddle-webhooks/references/verification.md**: The verification guide includes SDK examples but they don't match the feedback from Paddle team. Need to update SDK verification examples to match Paddle's official SDK middleware approach
  - Suggested fix: Update SDK examples in verification.md to use paddle.notifications.verify() and paddle.notifications.unmarshal() methods as shown in the official Paddle SDK documentation

### Major

- [ ] **skills/paddle-webhooks/examples/express/src/index.js**: Express example correctly implements SDK verification but the manual verification could be improved to match Paddle's official examples
  - Suggested fix: Consider updating manual verification implementation to exactly match Paddle's official manual verification examples
- [ ] **skills/paddle-webhooks/examples/fastapi/main.py**: FastAPI example correctly implements SDK verification but the manual verification could be improved to match Paddle's official examples
  - Suggested fix: Consider updating manual verification implementation to exactly match Paddle's official manual verification examples
- [ ] **skills/paddle-webhooks/examples/nextjs/app/webhooks/paddle/route.ts**: Next.js example correctly implements SDK verification but the manual verification could be improved to match Paddle's official examples
  - Suggested fix: Consider updating manual verification implementation to exactly match Paddle's official manual verification examples

### Minor

- [ ] **skills/paddle-webhooks/references/verification.md**: The replay protection example shows toleranceSeconds as 5 but the comment incorrectly says it's in seconds when it should clarify it's comparing seconds
  - Suggested fix: Update line 184 comment to be clearer about the units being compared
- [ ] **skills/paddle-webhooks/examples/fastapi/requirements.txt**: FastAPI version constraint is >=0.100.0 but latest stable is 0.128.0. Could be more specific
  - Suggested fix: Consider using >=0.128.0 for FastAPI to ensure users get the latest stable version

