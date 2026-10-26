---
name: bindbee-webhooks
description: >
  Receive and verify Bindbee webhooks. Use when setting up Bindbee webhook
  handlers, debugging webhook-signature verification (Standard Webhooks with a
  raw-string secret), or handling events like connector.linked,
  connector.sync.completed, connector.relink_needed or hris.employee.created.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Bindbee Webhooks

## When to Use This Skill

- How do I receive Bindbee webhooks?
- How do I verify the `webhook-signature` header on a Bindbee webhook?
- Why does the `standardwebhooks` or `svix` library reject my Bindbee webhook signature?
- How do I handle `connector.sync.completed`, `connector.relink_needed` or `hris.employee.created` events?
- Why do my Bindbee version 1 webhooks fail verification?

## Version 2 webhooks only

Bindbee pins each webhook to a version. Version 2 (`2026.10.06`, current) sends the Standard Webhooks `webhook-*` headers. Version 1 (`2025.01.01`, deprecated December 31, 2026) does not, and cannot be verified by this skill.

Hookdeck's configuration alert for this source reads: "Paste the security signature secret as-is. Only version 2 webhooks are supported; version 1 webhooks lack the webhook-* headers and fail verification."

## Verification (core)

Bindbee signs `{webhook-id}.{webhook-timestamp}.{raw body}` with **HMAC-SHA256** and sends base64 digests in `webhook-signature` as space-separated `v1,<base64>` entries. The secret is the single organization-wide security signature secret from the Webhooks page. Its **raw UTF-8 bytes are the HMAC key**: it is not a `whsec_` base64 secret, so do **not** use the `standardwebhooks` or `svix` libraries (they base64-decode the key and compute the wrong signature). Verify by hand:

```javascript
const crypto = require('crypto');

function verifyBindbeeSignature(rawBody, headers, secret) {
  const id = headers['webhook-id'], ts = headers['webhook-timestamp'], sigs = headers['webhook-signature'];
  if (!id || !ts || !sigs || !secret || !/^[1-9][0-9]*$/.test(ts)) return false;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64') // mirrors Hookdeck; Bindbee secrets have no prefix
    : Buffer.from(secret, 'utf8');
  if (key.length === 0) return false; // fail closed
  const signed = Buffer.concat([Buffer.from(`${id}.${ts}.`), rawBody]);
  const expected = Buffer.from(crypto.createHmac('sha256', key).update(signed).digest('base64'));
  return sigs.split(' ').some((entry) => {
    const [version, value = ''] = entry.split(',');
    const candidate = Buffer.from(value);
    return version === 'v1' && candidate.length === expected.length
      && crypto.timingSafeEqual(candidate, expected);
  });
}
```

Python:

```python
import base64, hashlib, hmac

def verify_bindbee_signature(raw_body: bytes, webhook_id: str, timestamp: str, sig_header: str, secret: str) -> bool:
    key = secret.encode("utf-8")  # raw UTF-8 bytes, not base64-decoded
    if not key:
        return False
    signed = f"{webhook_id}.{timestamp}.".encode() + raw_body
    expected = base64.b64encode(hmac.new(key, signed, hashlib.sha256).digest())
    return any(
        v == "v1" and hmac.compare_digest(s.encode(), expected)
        for v, _, s in (e.partition(",") for e in sig_header.split(" "))
    )
```

Use the **raw body** (`express.raw({ type: '*/*' })` in Express), then parse JSON only after the check. There is no timestamp window by default because Hookdeck retries and replays resend the original timestamp; set `BINDBEE_WEBHOOK_TOLERANCE_SECONDS` to opt in. Dedupe on the body's `id` (equal to `webhook-id`).

> **For complete handlers with tests**, see [examples/express/](examples/express/), [examples/nextjs/](examples/nextjs/), [examples/fastapi/](examples/fastapi/).

## Common Event Types

The event name is the top-level `event` field in the JSON body (it is not sent in a header).

| Event | Description |
|-------|-------------|
| `connector.linked` | A connector was linked |
| `connector.relinked` | A connector was relinked |
| `connector.relink_needed` | A connector needs to be relinked (includes `error`) |
| `connector.sync.started` | A sync started |
| `connector.sync.completed` | A sync completed |
| `connector.sync.failed` | A sync failed (includes `error`) |
| `hris.employee.created` | An employee was created (data events also carry `model`) |
| `hris.employee.updated` | An employee was updated |

Bindbee documents 92 event types, including `hris.company.*`, `hris.location.*`, `hris.group.*`, `hris.pay_group.*`, `hris.payroll_code.*`, `hris.employment.*`, `hris.compensation.*`, `hris.dependent.*`, `hris.bank_info.*` and `hris.employer_benefit.*` created/updated events; the list may not be exhaustive. See [references/overview.md](references/overview.md).

## Environment Variables

```bash
BINDBEE_WEBHOOK_SECRET=your_bindbee_security_signature_secret   # exactly as shown, no prefix added
BINDBEE_WEBHOOK_TOLERANCE_SECONDS=300   # optional; unset or 0 means no timestamp window
```

## Local Development

```bash
npx hookdeck-cli listen 3000 bindbee --path /webhooks/bindbee
```

No account required. The CLI creates a guest account on first run and provides a local tunnel plus a web UI for inspecting requests. Use port `8000` for FastAPI.

## Reference Materials

- [references/overview.md](references/overview.md) - What Bindbee webhooks are, events, payload, delivery and retries
- [references/setup.md](references/setup.md) - Create a webhook and find the secret
- [references/verification.md](references/verification.md) - Signature details and gotchas

## Recommended: webhook-handler-patterns

We recommend installing [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) alongside this skill:

- [Handler sequence](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/handler-sequence.md)
- [Idempotency](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/idempotency.md)
- [Error handling](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/error-handling.md)
- [Retry logic](https://github.com/hookdeck/webhook-skills/blob/main/skills/webhook-handler-patterns/references/retry-logic.md)

## Related Skills

- [hibob-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/hibob-webhooks) - HiBob HR webhooks (HMAC-SHA512, raw-string secret)
- [workable-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/workable-webhooks) - Workable recruiting webhooks
- [breezy-hr-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/breezy-hr-webhooks) - Breezy HR recruiting webhooks
- [nango-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/nango-webhooks) - Unified API integration webhooks
- [ada-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/ada-webhooks) - Standard Webhooks style signatures
- [bird-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/bird-webhooks) - Webhook signature verification
- [stripe-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/stripe-webhooks) - HMAC with timestamp
- [webhook-handler-patterns](https://github.com/hookdeck/webhook-skills/tree/main/skills/webhook-handler-patterns) - Idempotency, error handling, retry logic
- [hookdeck-event-gateway](https://github.com/hookdeck/webhook-skills/tree/main/skills/hookdeck-event-gateway) - Production webhook infrastructure
