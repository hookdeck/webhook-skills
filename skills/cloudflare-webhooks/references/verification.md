# How to Verify Cloudflare Webhooks

## How It Works

Cloudflare **does not sign generic webhooks**. There is no HMAC, no signature
algorithm, no timestamp and no Standard Webhooks headers. Authentication is a
shared secret:

- You enter a **Secret** when creating the webhook.
- Cloudflare sends it **verbatim** in the `cf-webhook-auth` header of every
  request.
- Your endpoint rejects any request where the header is missing or isn't your
  value.

([Generic webhooks](https://developers.cloudflare.com/notifications/get-started/configure-webhooks/#generic-webhooks))

| Property | Value |
|---|---|
| Header | `cf-webhook-auth` |
| Content | The secret, exactly as entered. No `Bearer ` prefix, no encoding |
| Signed content | None |
| Compare | Constant-time, whole value |

## Implementation

### SDK Verification

Cloudflare has no SDK with a webhook verification helper. Use your language's
constant-time compare.

### Manual Verification

**Node.js**

```javascript
const crypto = require('crypto');

function verifyCloudflareAuth(header, secret) {
  if (!header || !secret) return false;
  const a = Buffer.from(String(header), 'utf8');
  const b = Buffer.from(String(secret), 'utf8');
  // timingSafeEqual throws on different lengths, so check length first
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

verifyCloudflareAuth(req.headers['cf-webhook-auth'], process.env.CLOUDFLARE_WEBHOOK_SECRET);
```

**Python**

```python
import hmac

def verify_cloudflare_auth(header, secret):
    if not header or not secret:
        return False
    return hmac.compare_digest(header.encode("utf-8"), secret.encode("utf-8"))

verify_cloudflare_auth(request.headers.get("cf-webhook-auth"), os.environ["CLOUDFLARE_WEBHOOK_SECRET"])
```

`hmac.compare_digest` is used purely as a constant-time comparison here. There
is no HMAC involved.

## Common Gotchas

- **No signature means no body check.** The raw body isn't part of any
  verification, so you don't need `express.raw()` for verification. The
  examples still authenticate before parsing so a bad request never reaches
  `JSON.parse`.
- **Fail closed.** If `CLOUDFLARE_WEBHOOK_SECRET` is unset, reject, don't
  skip the check. Comparing `undefined === undefined` has caused real bypasses.
- **Replay is possible.** A captured request stays valid until you change the
  secret. `ts` is the time the alert was generated, not a signed timestamp.
  Dedupe on `alert_correlation_id` + `alert_event` + `ts`, and rotate the
  secret if it leaks.
- **Rotating the secret** means editing the webhook in Cloudflare and
  updating your endpoint together. Cloudflare's edit form documents only a
  rename, so you may need to delete and recreate the webhook to change the
  secret. Plan for a short window where deliveries fail.
- **The test message has no `alert_type`.** Handle it, or "Save and Test" will
  look like a failure.
- **Optional secret.** Cloudflare lets you leave Secret empty, in which case no
  `cf-webhook-auth` header is sent for you to check. Always set one.
- **Allowlisting IPs is a supplement.** Cloudflare's ranges are shared and
  change, so don't rely on IP alone.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| 401 on every request | Secret in Cloudflare differs from `CLOUDFLARE_WEBHOOK_SECRET` (trailing newline or space from copy-paste is common) |
| 401 "Missing cf-webhook-auth" | The webhook has no Secret set, or a proxy/CDN strips custom headers |
| 500 "not configured" | `CLOUDFLARE_WEBHOOK_SECRET` isn't loaded in the server environment |
| Save and Test fails but real alerts work (or vice versa) | Handler doesn't accept the `text`-only test body, or the policy isn't attached to this webhook |
| Nothing arrives | Endpoint not on port 80/443 or not publicly resolvable, or a firewall blocks Cloudflare's IPs |

Inspect the received `cf-webhook-auth` header in the Hookdeck CLI web UI
(`npx hookdeck-cli listen 3000 cloudflare --path /webhooks/cloudflare`) and
compare it character for character with your secret.
