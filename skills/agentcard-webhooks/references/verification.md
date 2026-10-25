# How to Verify Agentcard Webhook Signatures

## How Does Agentcard Sign Webhooks?

Every delivery has an `AgentCard-Signature` header:

```
AgentCard-Signature: t=1757264400,v1=5257a869e7ecebeda32affa62cdca3fa51cad7e77a0e56ff536d0ce8e108d8bd
```

- `t`: Unix timestamp in seconds
- `v1`: lowercase hex HMAC-SHA256 (64 chars). Agentcard's docs show one `v1`; the examples accept the header if any `v1` matches, defensively.
- Key: the endpoint's **whole** secret string, including `whsec_`, as UTF-8
- Signed message: `"<t>.<raw request body>"`

A legacy `X-AgentCard-Signature: sha256=<hex>` header signs the body alone. Hookdeck uses `AgentCard-Signature`, and the examples verify only that header; the legacy header is not used.

## This Is Not Standard Webhooks

The secret looks like `whsec_...` but there is no `webhook-id` / `webhook-timestamp` / `webhook-signature` and no base64 key. Don't use the `standardwebhooks` or `svix` libraries, and don't strip or decode the prefix: the HMAC key is the full string.

## Implementation

Split the header on `,`, trim each part (a space after the comma is allowed), split each on the first `=`. Take `t` and every `v1`. Reject a header with no `t` or no `v1`.

```javascript
const expected = crypto.createHmac('sha256', secret)   // whole whsec_... string
  .update(`${t}.`).update(rawBody).digest();
const ok = v1s.some((s) => /^[0-9a-f]{64}$/i.test(s) &&
  crypto.timingSafeEqual(Buffer.from(s, 'hex'), expected));
```

```python
expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
ok = any(hmac.compare_digest(s.lower().encode(), expected) for s in v1_values)
```

- **Node:** check the value is exactly 64 hex chars before `Buffer.from(x, 'hex')`; invalid hex silently truncates and would compare a shorter buffer.
- **Python:** call `hmac.compare_digest` on bytes (encode both sides). With `str` arguments a non-ASCII header raises `TypeError` and returns a 500 instead of rejecting.

## Where Does the Timestamp Window Go?

Agentcard's docs suggest rejecting timestamps older than a few minutes. The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Agentcard's own retries run for over an hour.

The check is opt-in: set `AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyAgentcard` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/agentcard/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_agentcard` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400`. Replays from Hookdeck can be older still, so a window never fully fits replays.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, dedupe on the event `id` (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Don't parse and re-serialise JSON first. Use `express.raw({ type: '*/*' })` in Express (verification then doesn't depend on `Content-Type`), `request.text()` in Next.js, `await request.body()` in FastAPI.
- **Secret as-is:** keep the `whsec_` prefix and don't base64-decode.
- **Header casing:** HTTP headers are case-insensitive; Node lowercases to `agentcard-signature`.
- **Status codes:** reply 400 for a bad signature, 500 only if your own secret is missing.
- **Respond quickly:** return `2xx`, then do slow work asynchronously.

## How Do I Debug Verification Failures?

- Compare `AGENTCARD_WEBHOOK_SECRET` with the endpoint's secret (`GET /api/v2/webhook_endpoints/{id}/secret`): whole value, no whitespace or quotes, `whsec_` included.
- After `roll_secret`, update the verifier right away: deliveries are signed with the new secret from the next event, and no overlap period is documented.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Sandbox and production endpoints have different secrets.
- If you set `AGENTCARD_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
