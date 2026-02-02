Review the {{PROVIDER_KEBAB}}-webhooks skill that was generated. Your task is to validate the content accuracy against {{PROVIDER}}'s official documentation.

## Review Instructions

For each item in the checklist below, verify against {{PROVIDER}}'s official webhook documentation. If you need to look up documentation, do so.

{{DOCS_REFERENCE}}

## Review Checklist

### Signature Verification (CRITICAL - most common source of bugs)

- [ ] **Algorithm is correct** - Is it HMAC-SHA256, HMAC-SHA1, or something else?
- [ ] **Encoding is correct** - Is the signature hex-encoded or base64-encoded?
- [ ] **Header name(s) are exactly right** - Header names are case-sensitive in some frameworks
- [ ] **Secret format handled correctly** - Does the secret have a prefix like `whsec_` that needs to be stripped?
- [ ] **Timestamp validation** - If the provider uses timestamp validation, is it implemented?
- [ ] **Signed content format** - What exactly is signed? Just the body? `timestamp.body`? `msgId.timestamp.body`?
- [ ] **Raw body used** - Is the raw body (not parsed JSON) used for verification?

### Event Types

- [ ] **Events actually exist** - All listed events should exist in {{PROVIDER}}'s documentation
- [ ] **Event names are spelled correctly** - Typos will cause handlers to never trigger
- [ ] **Payload field names are accurate** - The example payload fields should match real payloads

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

- [ ] **Next.js version is 15.x or later** - Version 14.x has known security vulnerabilities
- [ ] **Express version is 4.21.x or later** - Older versions may have vulnerabilities
- [ ] **FastAPI version is 0.115.x or later** - Use current stable releases
- [ ] **Test framework versions are current** - Jest 29.x+, Vitest 2.x+, pytest 8.x+
- [ ] **No pinned old versions** - Dependencies should use ^ or >= to allow security updates

Check package.json and requirements.txt files for outdated versions. If found, flag as critical.

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
