# How to Verify Sevalla Webhook Requests

## Does Sevalla Sign Webhooks?

No. Despite its name and the `whsec_` prefix, `svl-signature` is **not a signature** and the
scheme is **not Standard Webhooks**. Sevalla says: "The `svl-signature` header contains the
webhook's signing secret itself, not a hash of the body." The header carries `whsec_` followed by
30 characters, as plain text, on every request.

So there is **no HMAC to compute**. Do not use the `svix` or `standardwebhooks` libraries: they
would look for `webhook-id`/`webhook-timestamp` headers that Sevalla doesn't send.

```
svl-signature: whsec_<30 characters>
```

To check a request, compare the **whole header value** (including `whsec_`) with the secret you
stored, in constant time. Missing header or mismatch: `401`.

## Security Limits

A static shared credential authenticates the **sender**, not the **body**. There is no signature
over the payload and no timestamp, so:

- a modified body cannot be detected, and a captured request can be replayed;
- anyone who sees one request (a logging proxy, a misconfigured server) learns the secret.

Use HTTPS only, keep the secret out of logs, and roll the secret if it leaks. Deduplicate on
`event_id` to blunt replays.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// secrets: the current secret, plus the old one while a rollover is under way
function verifySevallaRequest(headers, secrets = [process.env.SEVALLA_WEBHOOK_SECRET, process.env.SEVALLA_WEBHOOK_SECRET_OLD]) {
  const received = headers['svl-signature'];
  if (typeof received !== 'string') return false;
  return secrets.filter(Boolean).some((secret) => safeEqual(received, secret));
}
```

Hashing both sides gives equal-length buffers so `timingSafeEqual` never throws. (Sevalla's own
sample checks `length` and then calls `timingSafeEqual` on equal-length Buffers, which is also fine.)

### Python

```python
import hmac, os

def verify_sevalla_request(headers, secrets=None) -> bool:
    secrets = secrets if secrets is not None else [
        os.environ.get("SEVALLA_WEBHOOK_SECRET"), os.environ.get("SEVALLA_WEBHOOK_SECRET_OLD")]
    received = headers.get("svl-signature")
    if received is None:
        return False
    return any(hmac.compare_digest(received.encode("utf-8"), s.encode("utf-8"))
               for s in secrets if s)
```

Encode both sides to bytes: `hmac.compare_digest` raises `TypeError` for non-ASCII `str`.

## Common Gotchas

- **Compare the whole value.** Don't strip `whsec_`, split on anything, or compare a prefix.
- **Rolling the secret.** Deliveries carry the old secret until the activation time, then the new
  one. Update the stored value then, or accept both during the rollover
  (`SEVALLA_WEBHOOK_SECRET_OLD`). Choosing **Now** switches immediately.
- **Fail closed.** If `SEVALLA_WEBHOOK_SECRET` is unset, reject everything. Empty secrets are
  filtered out so an empty header can never match.
- **Raw body.** Read it raw (`express.raw({ type: '*/*' })`) so any content type is accepted, then
  `JSON.parse` after the header check.
- **Retries carry the current secret.** A retry queued before a roll is signed with whichever
  secret is current when it is sent.
- **Respond fast.** Return `2xx` right after the check and do slow work after, so a slow handler
  isn't counted as a failed delivery.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| 401 on every request | `SEVALLA_WEBHOOK_SECRET` unset, wrong webhook's secret, or `whsec_` prefix dropped |
| 401 began after rolling the secret | The new secret became active; update the stored value |
| 401 only behind a proxy | The proxy strips or renames `svl-signature` |
| Library complains about `webhook-id` | You used a Svix/Standard Webhooks verifier; remove it |
| 400 after authentication | Body isn't a JSON object |
