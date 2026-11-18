# PayFit Signature Verification

## Why Svix

PayFit's docs say nothing about signing. Its event catalogue is hosted by Svix for PayFit's Svix organization and links to Svix's guide for consuming webhooks, so deliveries follow Svix's scheme (the same as Standard Webhooks, with `svix-` header names).

## The Scheme

| Part | Value |
|---|---|
| Headers | `svix-id`, `svix-timestamp` (seconds), `svix-signature` |
| Signature list | Space-separated `v1,<base64>` entries. More than one during a secret rotation |
| Algorithm | HMAC-SHA256, base64 |
| Key | The signing secret after `whsec_`, **base64-decoded** |
| Signed content | `{svix-id}.{svix-timestamp}.{raw body}` |

From [Svix's manual verification guide](https://docs.svix.com/receiving/verifying-payloads/how-manual): "HMAC the `signed_content` … using the base64 portion of your signing secret (this is the part after the `whsec_` prefix) as the key", with the sample `Buffer.from(secret.split('_')[1], "base64")`.

## Node.js

```javascript
const crypto = require('crypto');

function decodeSigningSecret(secret) {
  const value = String(secret || '').trim().replace(/^whsec_/, '');
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return null;
  const key = Buffer.from(value, 'base64');
  if (key.length === 0 || key.toString('base64').replace(/=+$/, '') !== value.replace(/=+$/, '')) return null;
  return key;
}

function verifyPayfitWebhook(rawBody, headers, secret) {
  const key = decodeSigningSecret(secret);
  const id = headers['svix-id'], timestamp = headers['svix-timestamp'], signatures = headers['svix-signature'];
  if (!key || !id || !timestamp || !signatures) return false;
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.`).update(rawBody).digest();
  return signatures.trim().split(/\s+/).some((entry) => {
    const [version, signature] = entry.split(',');
    if (version !== 'v1' || !signature) return false;
    const given = Buffer.from(signature, 'base64');
    return given.length === expected.length && crypto.timingSafeEqual(given, expected);
  });
}
```

## Python

```python
import base64, hashlib, hmac

def verify_payfit_webhook(raw_body: bytes, headers, secret: str) -> bool:
    key = base64.b64decode(secret.strip().removeprefix("whsec_"))
    msg_id, timestamp, signatures = headers.get("svix-id"), headers.get("svix-timestamp"), headers.get("svix-signature")
    if not msg_id or not timestamp or not signatures:
        return False
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    return any(
        version == "v1" and hmac.compare_digest(base64.b64decode(sig), expected)
        for version, _, sig in (entry.partition(",") for entry in signatures.split())
    )
```

Or use the `svix` package: `Webhook(secret).verify(payload, headers)`.

## Svix's Example Vector

From Svix's manual verification guide. Every example's tests check it (with no timestamp window: the timestamp is old).

| | |
|---|---|
| Secret | `whsec_plJ3nmyCDGBKInavdOK15jsl` |
| `svix-id` | `msg_loFOjxBNrRLzqYUf` |
| `svix-timestamp` | `1731705121` |
| Body | `{"event_type":"ping","data":{"success":true}}` |
| `svix-signature` | `v1,rAvfW3dJ/X/qxhsaXPOyyCGmRKsaKWcsNccKXlIktD0=` |

## Timestamp Window

Svix's guide says to compare `svix-timestamp` with your clock "within your tolerance". The `svix` libraries use 5 minutes. The examples leave the window off unless `PAYFIT_WEBHOOK_TOLERANCE_SECONDS` is set, because retried and recovered messages keep their original timestamp when they pass through a queue. Dedupe on `svix-id`.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Every request fails | The secret was used as text. Strip `whsec_` and base64-decode it |
| Every request fails, secret decoded | The body was parsed and re-serialised. HMAC the raw bytes |
| Fails after rotating the secret | You only checked the first `v1` entry. Check them all |
| Old deliveries fail | A timestamp window is on and the message was replayed. Widen or remove it |
| `500` from the examples | `PAYFIT_WEBHOOK_SECRET` isn't valid base64 after the prefix |
