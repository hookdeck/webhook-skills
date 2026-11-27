# How to Verify Cisco Meraki Webhooks

## How It Works

Meraki webhook alerts do **not** use an HMAC signature and do **not** follow the
Standard Webhooks spec. There is **no `webhook-signature` / `X-*-Signature`
header** to validate. Instead:

1. You set a **Shared secret** on the HTTP server in the Dashboard.
2. Meraki includes that exact string as a plaintext **`sharedSecret`** field
   **inside the JSON request body** of every webhook.
3. Your handler parses the body and compares `payload.sharedSecret` against the
   secret you configured (`MERAKI_WEBHOOK_SECRET`).

Because the secret is transmitted in cleartext, **TLS is the real transport
security**. Meraki requires HTTPS with a CA-trusted certificate (no self-signed
certs). The `sharedSecret` only proves the sender knows the value you set — it is
a bearer token in the body, not a cryptographic signature over the payload.

> Any generic "verify the signature header" logic will **not** work for Meraki.
> It is a literal string compare on a body field.

## The Secret Is Optional — Branch On It Explicitly

Meraki's shared secret is genuinely optional: leave it blank on the HTTP server
and deliveries carry no secret value, with TLS as the only protection.
That makes the naive implementation dangerous, because "no secret configured" and
"no secret in the payload" both coerce to `''` and compare equal — an unsecured
endpoint then **silently accepts everything** while looking like it verifies.
(And the mirror-image bug: with the secret unset, a real Meraki payload *does*
carry `sharedSecret`, so the same comparison rejects every legitimate delivery
with a misleading "invalid secret" message.)

The examples in this skill therefore branch on the configuration, not on the
payload:

- **`MERAKI_WEBHOOK_SECRET` unset/empty** → accept the delivery, and log a
  one-time warning that no shared-secret verification is configured and TLS is
  the only protection. This matches Meraki's TLS-only mode, but makes it visible.
- **`MERAKI_WEBHOOK_SECRET` set** → the payload **must** carry a `sharedSecret`
  that matches it. Anything else is rejected with `401 Missing or invalid
  sharedSecret in payload`.

For any endpoint receiving real alerts, configure the secret. Treat the warning
above as a deployment defect, not normal output.

## Implementation

There is no official SDK method for webhook verification (the Meraki SDKs are
Dashboard API clients only), so verification is always "manual". Still, use a
**timing-safe** comparison to avoid leaking the secret via timing.

### Node.js

```javascript
const crypto = require('crypto');

let warnedNoSecretConfigured = false;

function verifyMerakiWebhook(rawBody, secret) {
  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return false;
  }

  // No secret configured: TLS-only mode. Accept, but say so once.
  if (!secret) {
    if (!warnedNoSecretConfigured) {
      warnedNoSecretConfigured = true;
      console.warn(
        'MERAKI_WEBHOOK_SECRET is not set: no shared-secret verification is ' +
          'configured, so TLS is the only protection for these webhooks.'
      );
    }
    return true;
  }

  const received = Buffer.from(String(payload.sharedSecret ?? ''));
  const expected = Buffer.from(String(secret));
  // timingSafeEqual throws on length mismatch — guard first.
  return received.length === expected.length &&
    crypto.timingSafeEqual(received, expected);
}
```

### Python

```python
import json
import hmac

_warned_no_secret_configured = False

def verify_meraki_webhook(raw_body: bytes, secret: str) -> bool:
    global _warned_no_secret_configured
    try:
        payload = json.loads(raw_body)
    except ValueError:
        return False

    # No secret configured: TLS-only mode. Accept, but say so once.
    if not secret:
        if not _warned_no_secret_configured:
            _warned_no_secret_configured = True
            print(
                "WARNING: MERAKI_WEBHOOK_SECRET is not set: no shared-secret "
                "verification is configured, so TLS is the only protection."
            )
        return True

    received = str(payload.get("sharedSecret", ""))
    # compare_digest is constant-time and length-safe.
    return hmac.compare_digest(received, secret)
```

## Common Gotchas

- **No signature header.** Don't look for `webhook-signature`, `X-Meraki-*`, or
  any HMAC. The secret is `payload.sharedSecret` in the body.
- **The secret is optional — don't let that fail open silently.** If you leave
  "Shared secret" blank in the Dashboard, `sharedSecret` is absent or empty, and
  a naive `'' == ''` compare accepts anything with no warning. Branch on whether
  a secret is configured (see above): when one is set, require and match it, so
  anyone who discovers your URL can't just POST to it.
- **TLS matters more than the secret.** Terminate HTTPS with a CA-trusted cert;
  the secret is cleartext in the body.
- **Custom Liquid templates change the shape.** If the HTTP server uses a custom
  payload template, `sharedSecret` may be renamed, moved, or omitted, and headers
  may be added. Verify against whatever the template actually emits (or keep the
  default template so `sharedSecret` stays at the top level).
- **Use `alertTypeId`, not `alertType`, to dispatch.** The human label
  (`alertType`) can change; the id (`alertTypeId`) is stable.
- **Parse defensively.** A body that isn't valid JSON should fail verification,
  not throw a 500.
- **Timing-safe compare.** Use `crypto.timingSafeEqual` / `hmac.compare_digest`
  rather than `==` so you don't leak the secret via response timing.

## Debugging Verification Failures

| Symptom | Likely Cause | Fix |
|---------|--------------|-----|
| Every request rejected | `MERAKI_WEBHOOK_SECRET` doesn't match the Dashboard "Shared secret" | Copy the exact value from the HTTP server config |
| `sharedSecret` is `undefined` | Secret left blank in the Dashboard, or a custom template dropped it | Set a shared secret on the HTTP server; keep the default template |
| "No shared-secret verification is configured" warning at startup/first delivery | `MERAKI_WEBHOOK_SECRET` is unset, so the handler is in TLS-only mode | Set a shared secret on the HTTP server and in the env var |
| Works for "Send test" but no real alerts arrive | The alert isn't assigned to the HTTP server | Select the HTTP server as a recipient for the alert under Network-wide > Alerts |
| Handler throws 500 on bad input | Parsing before validating | Wrap `JSON.parse` in try/catch and return 400 |
