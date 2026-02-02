Create a complete webhook skill for {{PROVIDER}} following the AGENTS.md specification in this repository.

## Research Phase

{{DOCS_SECTION}}

Determine the following about {{PROVIDER}} webhooks:
- Signature verification method (HMAC algorithm, encoding, headers)
- Common webhook events and their payloads
- Any gotchas or special requirements (raw body handling, timestamp validation, etc.)

## Creation Phase

Read the AGENTS.md file in this repository to understand the full skill creation checklist.

Create all required files:

### Core Files
- `skills/{{PROVIDER_KEBAB}}-webhooks/SKILL.md` - Main skill file with frontmatter and essential code
- `skills/{{PROVIDER_KEBAB}}-webhooks/references/overview.md` - What webhooks are, common events
- `skills/{{PROVIDER_KEBAB}}-webhooks/references/setup.md` - Dashboard configuration steps
- `skills/{{PROVIDER_KEBAB}}-webhooks/references/verification.md` - Signature verification details

### Examples (all three frameworks)

**Express (Node.js):**
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/package.json`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/.env.example`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/README.md`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/src/index.js`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/test/webhook.test.js`

**Next.js:**
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/package.json`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/.env.example`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/README.md`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/app/webhooks/{{PROVIDER_KEBAB}}/route.ts`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/test/webhook.test.ts`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs/vitest.config.ts`

**FastAPI (Python):**
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi/requirements.txt`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi/.env.example`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi/README.md`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi/main.py`
- `skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi/test_webhook.py`

## Important Guidelines

1. **Prefer manual signature verification** over SDK methods - it's more reliable and educational
2. **Use raw body** for signature verification - don't parse JSON before verifying
3. **Include comprehensive tests** that generate real signatures using the provider's algorithm
4. **Be idiomatic** to each framework (Express middleware patterns, Next.js App Router, FastAPI dependencies)
5. **Return appropriate HTTP status codes** (200 for success, 400 for invalid signature, etc.)

## CRITICAL: Dependency Versions

**Always use current/latest stable versions.** Do NOT use versions from your training data - they are likely outdated and may have security vulnerabilities.

**Before writing package.json or requirements.txt, look up current versions:**
```bash
npm view next version      # Should be 15.x or later, NOT 14.x
npm view express version   # Should be 4.21.x or later
pip index versions fastapi # Should be 0.115.x or later
```

**Minimum versions to use:**
- `next`: ^15.0.0 (NOT 14.x - has known vulnerabilities)
- `express`: ^4.21.0
- `vitest`: ^2.0.0
- `jest`: ^29.0.0
- `fastapi`: >=0.115.0
- `pytest`: >=8.0.0

**Always use ^ prefix** to allow minor/patch updates for security fixes.

## Validation Phase

After creating all files, run the tests to verify they pass:

```bash
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/express && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && pytest test_webhook.py
```

Fix any test failures before completing.
