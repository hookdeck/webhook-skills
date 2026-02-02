Review the {{PROVIDER_KEBAB}}-webhooks skill that was generated. Your task is to validate the content accuracy against {{PROVIDER}}'s official documentation.

## Check for Existing TODO.md

First, check if `skills/{{PROVIDER_KEBAB}}-webhooks/TODO.md` exists. If it does, read it to understand:
- Previously identified issues that may or may not have been fixed
- Known limitations or areas needing improvement
- Items that were deferred as acceptable for initial release

Verify that issues listed in TODO.md have been addressed, or explain why they remain.

## Review Instructions

For each item in the checklist below, verify against {{PROVIDER}}'s official webhook documentation. If you need to look up documentation, do so.

{{DOCS_REFERENCE}}

## Review Checklist

### Signature Verification (CRITICAL - most common source of bugs)

- [ ] **Algorithm is correct** - Is it HMAC-SHA256, HMAC-SHA1, ECDSA, or something else?
- [ ] **Encoding is correct** - Is the signature hex-encoded or base64-encoded?
- [ ] **Header name(s) are exactly right** - Common patterns:
  - Simple: `X-Provider-Signature` 
  - Standard Webhooks: `webhook-id`, `webhook-timestamp`, `webhook-signature`
  - Provider-specific: `Stripe-Signature`, `X-GitHub-Event`, etc.
- [ ] **Secret format handled correctly** - Does the secret have a prefix like `whsec_` that needs to be stripped?
- [ ] **Timestamp validation** - If the provider uses timestamp validation, is it implemented?
- [ ] **Signed content format** - What exactly is signed?
  - Just the body: `HMAC(secret, body)`
  - Timestamp + body: `HMAC(secret, "timestamp.body")`
  - Standard Webhooks: `HMAC(secret, "msgId.timestamp.body")`
- [ ] **Raw body used** - Is the raw body (not parsed JSON) used for verification?

**Standard Webhooks Detection:**
If the provider uses Standard Webhooks (Svix), verify:
- Headers are `webhook-id`, `webhook-timestamp`, `webhook-signature` (NOT `provider-signature`)
- Signed content is `{msgId}.{timestamp}.{body}`
- Timestamp tolerance is checked (usually 5 minutes)
- Providers using Standard Webhooks: Resend, OpenAI, Clerk, and others

### Event Types (CRITICAL - verify against official docs)

- [ ] **Events actually exist** - All listed events should exist in {{PROVIDER}}'s documentation
- [ ] **Event names are EXACTLY correct** - Must match official docs precisely:
  - Underscores vs dots vs spaces matter (`spam_report` vs `spam.report` vs `spam report`)
  - Past tense matters (`completed` vs `succeeded` vs `finished`)
  - Verify by searching {{PROVIDER}}'s webhook documentation
- [ ] **Payload field names are accurate** - The example payload fields should match real payloads
- [ ] **Same events handled in ALL frameworks** - Express, Next.js, and FastAPI should handle the same events

### Documentation

- [ ] **Setup steps are accurate** - Do the dashboard paths and steps match {{PROVIDER}}'s current UI?
- [ ] **Links are valid** - Are external documentation links working URLs?
- [ ] **Environment variable names follow conventions** - Do they match what {{PROVIDER}} recommends?

### Code Quality

- [ ] **Raw body handling is correct per framework**
  - Express: `express.raw({ type: 'application/json' })`
  - Next.js: Reading from `request.text()` before `request.json()`
  - FastAPI: `await request.body()` before any JSON parsing
- [ ] **Error responses use appropriate status codes** - 400 for invalid signature, not 500
- [ ] **Examples are idiomatic** - Code follows framework conventions

### Dependency Versions (CRITICAL - security risk)

**Check each file against these EXACT requirements:**

| Package | Required | Flag if |
|---------|----------|---------|
| `next` | ^15.1.0+ | 14.x or lower (security issues) |
| `express` | ^4.21.0+ | 5.x (beta) or <4.21 |
| `vitest` | ^2.1.0+ | 3.x, 4.x, or higher (don't exist!) |
| `jest` | ^29.7.0+ | <29.x |
| `fastapi` | >=0.115.0 | 0.128+ (doesn't exist yet!) |
| `pytest` | >=8.3.0 | 9.x+ (doesn't exist yet!) |
| `httpx` | >=0.27.0 | |

**Common hallucination errors to catch:**
- vitest 4.x or 5.x (latest is 2.x)
- pytest 9.x (latest is 8.x)  
- fastapi 0.128+ (latest is ~0.115)
- Express 5.x (still in RC/beta)

If you see these versions, flag as CRITICAL - they don't exist!

### Consistency

- [ ] **SKILL.md code snippets match example code** - No copy-paste drift
- [ ] **Environment variable names are consistent** - Same names in .env.example, code, and docs
- [ ] **Webhook endpoint paths are consistent** - `/webhooks/{{PROVIDER_KEBAB}}` everywhere

## Output Format

After reviewing, respond with a JSON object in this exact format:

```json
{
  "approved": false,
  "issues": [
    {
      "severity": "critical",
      "category": "verification",
      "file": "skills/{{PROVIDER_KEBAB}}-webhooks/examples/express/src/index.js",
      "description": "Signature algorithm is incorrect - using SHA1 but {{PROVIDER}} uses SHA256",
      "suggestedFix": "Change crypto.createHmac('sha1', ...) to crypto.createHmac('sha256', ...)"
    }
  ],
  "suggestions": [
    "Consider adding a note about rate limiting in the overview"
  ]
}
```

**Severity levels:**
- `critical` - Will cause verification failures or security issues. Must fix.
- `major` - Incorrect information that will confuse users. Should fix.
- `minor` - Style issues or minor improvements. Nice to fix.

**Categories:**
- `verification` - Signature verification issues
- `events` - Event type or payload issues
- `documentation` - Documentation accuracy issues
- `code` - Code quality or correctness issues
- `consistency` - Inconsistencies between files
- `dependencies` - Outdated or vulnerable dependency versions

If everything looks correct, respond with:
```json
{
  "approved": true,
  "issues": [],
  "suggestions": []
}
```
