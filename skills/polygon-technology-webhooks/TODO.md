# TODO - Known Issues and Improvements

*Last updated: 2026-11-20*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Minor

- [ ] **skills/polygon-technology-webhooks/references/setup.md**: States webhooks are 'managed through the API, not a dashboard form', but the official API overview (https://docs.polygon.technology/api-reference/overview) says 'Subscribe to the event types you want in the OMS Dashboard or via the Webhooks endpoints'.
  - Suggested fix: Reword to: 'Create and manage webhooks in the OMS Dashboard or through the Webhooks API. This guide uses the API.' The signingKey-shown-once guidance stays as is.
- [ ] **skills/polygon-technology-webhooks/examples/nextjs/test/webhook.test.ts**: The Next.js suite has 13 tests, while Express and FastAPI each have 21 covering the same verification and dedupe edge cases (header order, missing t/v1, base64 and unprefixed HMACs, short signature, both directions of the time window, idempotencyKey dedupe, stale createdAt, pre-v1 schema, invalid JSON, missing key).
  - Suggested fix: Port the missing Express test cases to the Next.js vitest suite so all three frameworks have the same coverage.

## Suggestions

- [ ] Express logs resource.role and resource.rail on transfer.created while Next.js and FastAPI log only the id; align the three for exact parity.
- [ ] The Next.js node_modules/.bin directory is missing locally, so `npx vitest` fails until `npm install` is rerun; this is a local install artifact, not a skill defect.

