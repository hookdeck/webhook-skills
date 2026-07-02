# TODO - Known Issues and Improvements

*Last updated: 2026-07-02*

These items were identified during automated review but are acceptable for merge.
Contributions to address these items are welcome.

## Issues

### Major

- [ ] **skills/bitbucket-webhooks/references/verification.md**: The 'Reference Test Vector' is attributed to Bitbucket's documentation ('From Bitbucket's documentation, these values...'), but Bitbucket does not publish this test vector. The secret 'It's a Secret to Everybody' and payload are adapted from GitHub's webhook signature docs (GitHub's canonical example is body 'Hello, World!' -> sha256=757107ea...; this was altered to 'Hello World!' and recomputed to a4771c39...). The HMAC-SHA256 value is mathematically correct and usable, but the claim that it comes from Bitbucket's documentation is inaccurate and could mislead.
  - Suggested fix: Remove the 'From Bitbucket's documentation' attribution. Reword to present it as a self-computed sanity-check vector, e.g. 'Use this self-derived vector to sanity-check your implementation: HMAC-SHA256("Hello World!", "It's a Secret to Everybody") = a4771c39fbe90f317c7824e83ddef3caae9cb3d976c214ace1f2937e133263c9.' Do not attribute it to Bitbucket.

### Minor

- [ ] **skills/bitbucket-webhooks/SKILL.md**: The verification-core Node snippet in SKILL.md (line 42) does the timing-safe compare as crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected)) using default utf8 encoding, whereas the canonical example handler (examples/express/src/index.js) and references/verification.md use Buffer.from(signature, 'hex') / Buffer.from(expectedSignature, 'hex'). Both are functionally correct, but per the AGENTS.md content guideline the verification snippet's timing-safe compare should match the example exactly to avoid drift.
  - Suggested fix: Change SKILL.md line 42 to: return crypto.timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex')); so the compare matches the example handlers and verification.md.

## Suggestions

- [ ] The SKILL.md 'Related Skills' section links to gitlab-webhooks and clerk-webhooks. Confirm those skill directories exist in the repo; if not yet published, consider removing those links to avoid dead references when only this skill is installed.
- [ ] Consider noting in overview.md/setup.md that Bitbucket retries failed deliveries and that X-Request-UUID stays stable across retries (while X-Attempt-Number increments) — useful for idempotency, which ties into the linked webhook-handler-patterns skill.

