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

### Provider File

Create or update `providers/{{PROVIDER_KEBAB}}.yaml` (see `providers/stripe.yaml` for the shape). CI fails without:

- `docs.webhooks` (and `verification` / `events` URLs if they exist)
- `testScenario.events` listing 2-3 real event names
- `catalog.summary` - one line for the README provider table, in the same style as other providers' summaries: what gets verified (header names, algorithm) and the key events it handles. For example: ``Verify Stripe webhook signatures (`Stripe-Signature`, HMAC-SHA256), handle checkout.session.completed and payment_intent.succeeded events``

Do **not** edit `README.md` or `.claude-plugin/marketplace.json`. Both are generated from `providers/` and `skills/` after merge (`./scripts/generate-skills.sh sync`).

The generator runs `scripts/validate-provider.sh {{PROVIDER_KEBAB}}-webhooks` (the same check CI runs) after you finish.

## Important Guidelines

1. **Use the provider's official SDK** for signature verification when it supports the framework; **include manual verification** as a fallback for frameworks the SDK doesn't support (e.g., FastAPI when only Node SDK exists)
2. **Use raw body** for signature verification - don't parse JSON before verifying (SDK or manual)
3. **Include comprehensive tests** that generate real signatures using the provider's algorithm
4. **Be idiomatic** to each framework (Express middleware patterns, Next.js App Router, FastAPI dependencies)
5. **Return appropriate HTTP status codes** (200 for success, 400 for invalid signature, etc.)
6. **Hookdeck CLI in example READMEs** — when an example shows how to receive webhooks locally, use exactly this form (no install step, source arg is required):
   - Express: `npx hookdeck-cli listen 3000 {{PROVIDER_KEBAB}} --path /webhooks/{{PROVIDER_KEBAB}}`
   - Next.js: `npx hookdeck-cli listen 3000 {{PROVIDER_KEBAB}} --path /webhooks/{{PROVIDER_KEBAB}}`
   - FastAPI: `npx hookdeck-cli listen 8000 {{PROVIDER_KEBAB}} --path /webhooks/{{PROVIDER_KEBAB}}`

   Do **not** write `hookdeck listen ...` (assumes a global install), and do **not** omit the source positional arg (the CLI would otherwise prompt interactively). See `AGENTS.md` → "Local Development" for the rationale.
7. **`SKILL.md` inline code is for the verification core only** — keep it short (typically under 25 lines) and scoped to the algorithm/header/comparison essentials. The full Express/Next.js/FastAPI handler (route wiring, event dispatch, error responses) belongs in `examples/`, not in `SKILL.md`. After the verification snippet, link the example directories so agents can pull the runnable, CI-tested version:

   ```markdown
   > **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).
   ```

   Do **not** duplicate the full handler from `examples/<framework>/src/...` into `SKILL.md`. Drift between the two is a recurring source of bugs (e.g. SDK API changes captured only in the example).

## CRITICAL: Consistency Checks

**Before finalizing, verify these are consistent across all files:**

1. **Event names** - SKILL.md, overview.md, and all three example handlers must use identical event names
2. **Header names** - All files must reference the same signature header(s)
3. **Verification algorithm** - the verification core snippet in `SKILL.md` (algorithm + header parse + timing-safe compare) must match how the example handlers verify. Keep the SKILL.md snippet short and focused; the full handler lives in `examples/`
4. **Environment variable names** - Consistent across .env.example and code files

**Check for these common mistakes:**
- Verification logic is inconsistent (e.g., SKILL.md and examples use different signed content format or algorithm)
- overview.md lists different events than the code handles
- setup.md describes headers that don't match the code

## Reference Existing Skills

Look at existing skills in `skills/` directory for patterns to follow:
- `skills/stripe-webhooks/` - HMAC-SHA256 with timestamp
- `skills/github-webhooks/` - HMAC-SHA256 simple
- `skills/shopify-webhooks/` - HMAC-SHA256 with Base64

Copy their structure and adapt for {{PROVIDER}}'s specific verification method.

## CRITICAL: Dependency Versions

**Use these EXACT versions (queried from package managers at generation time):**

{{VERSIONS_TABLE}}

These are the current stable versions. Use them exactly as shown.

## Validation Phase

After creating all files, run the tests to verify they pass:

```bash
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/express && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/nextjs && npm install && npm test
cd skills/{{PROVIDER_KEBAB}}-webhooks/examples/fastapi && python3 -m venv venv && source venv/bin/activate && pip install -r requirements.txt && pytest test_webhook.py
```

Fix any test failures before completing.
