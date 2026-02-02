Create a complete webhook skill for {{PROVIDER}} following the AGENTS.md specification in this repository.

## Research Phase (CRITICAL - Do This First)

{{DOCS_SECTION}}

**You MUST research and verify the following from official documentation before writing any code:**

### 1. Signature Verification
- What is the **exact header name(s)**? (e.g., `X-Provider-Signature`, `webhook-signature`)
- What algorithm is used? (HMAC-SHA256, ECDSA, etc.)
- What is signed? (raw body, `timestamp.body`, `msgId.timestamp.body`, etc.)
- Does it use Standard Webhooks? (headers: `webhook-id`, `webhook-timestamp`, `webhook-signature`)

### 2. Event Names (VERIFY FROM OFFICIAL DOCS)
- List the **exact** event type strings from the provider's documentation
- Do NOT guess event names - they must match exactly (e.g., `spam report` vs `spam_report` vs `spamreport`)
- Common mistakes: `completed` vs `succeeded`, underscores vs spaces vs dots

### 3. Authentication Method
- API key in header?
- Basic Auth (username:password)?
- OAuth?
- IP allowlist?

## Creation Phase

Read the AGENTS.md file in this repository to understand the full skill creation checklist.

**CRITICAL: You MUST create ALL of the following files. Missing files = incomplete skill.**

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

## CRITICAL: Consistency Checks

**Before finalizing, verify these are consistent across all files:**

1. **Event names** - SKILL.md, overview.md, and all three example handlers must use identical event names
2. **Header names** - All files must reference the same signature header(s)
3. **Verification algorithm** - SKILL.md inline code must match example implementations exactly
4. **Environment variable names** - Consistent across .env.example and code files

**Check for these common mistakes:**
- SKILL.md shows one verification approach, examples use a different one
- overview.md lists different events than the code handles
- setup.md describes headers that don't match the code

## Reference Existing Skills

Look at existing skills in `skills/` directory for patterns to follow:
- `skills/stripe-webhooks/` - HMAC-SHA256 with timestamp
- `skills/github-webhooks/` - HMAC-SHA256 simple
- `skills/shopify-webhooks/` - HMAC-SHA256 with Base64

Copy their structure and adapt for {{PROVIDER}}'s specific verification method.

## CRITICAL: Dependency Versions

**Your training data has OUTDATED versions. You MUST use these exact versions or newer:**

| Package | Minimum Version | Notes |
|---------|-----------------|-------|
| `next` | ^15.1.0 | NOT 14.x (security vulnerabilities) |
| `express` | ^4.21.0 | NOT 5.x (still beta) |
| `vitest` | ^2.1.0 | NOT 3.x or 4.x (don't exist) |
| `jest` | ^29.7.0 | |
| `typescript` | ^5.3.0 | |
| `fastapi` | >=0.115.0 | NOT 0.128+ (doesn't exist yet) |
| `pytest` | >=8.3.0 | NOT 9.x (doesn't exist yet) |
| `httpx` | >=0.27.0 | For FastAPI testing |

**IMPORTANT:** If a version seems too high (e.g., vitest 4.x, pytest 9.x, fastapi 0.128), it probably doesn't exist. Use the versions from this table.

## Validation Phase

After creating all files, run the tests to verify they pass:

```bash
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/express && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && pytest test_webhook.py
```

Fix any test failures before completing.
