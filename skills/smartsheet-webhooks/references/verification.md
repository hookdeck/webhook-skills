# How to Verify Smartsheet Webhooks

## How Does Smartsheet Authenticate Callbacks?

Two mechanisms:

1. **Verification challenge**: proves your endpoint wants the callbacks. Sent on enable and about once every 100 callbacks.
2. **`Smartsheet-Hmac-SHA256` signature** (optional but recommended): proves a callback came from Smartsheet and was not modified.

## Verification Challenge

The request has a `Smartsheet-Hook-Challenge` header holding a random value, and a JSON body `{"challenge": "<same value>", "webhookId": <id>}`. Respond:

- HTTP `200`
- the same value in the `Smartsheet-Hook-Response` response header, or in a JSON body attribute `smartsheetHookResponse`

The examples do both. Handle the challenge **before** checking the signature, because challenge requests may be unsigned. To accept callbacks only for webhooks you created, compare the body's `webhookId` with your stored IDs and return a non-200 (such as 403) for others; Smartsheet then disables that webhook.

If the challenge fails, the webhook becomes `DISABLED_VERIFICATION_FAILED`.

## Signature Verification

- Header: `Smartsheet-Hmac-SHA256`
- Algorithm: HMAC-SHA256
- Key: the webhook's `sharedSecret`
- Signed content: the raw request body (no timestamp or ID prefix)
- Encoding: hex (base 16); compare case-insensitively

```javascript
const expected = crypto.createHmac('sha256', sharedSecret).update(rawBody).digest('hex');
const ok = header.toLowerCase() === expected; // use timingSafeEqual in real code
```

```python
expected = hmac.new(shared_secret.encode(), raw_body, hashlib.sha256).hexdigest()
ok = hmac.compare_digest(header.lower().encode(), expected.encode())
```

Smartsheet's official SDKs do not include a webhook verification helper, so this is manual in all frameworks.

## Common Gotchas

- **Raw body**: hash the exact bytes received. In Express use `express.raw({ type: '*/*' })` so any content type verifies; in Next.js use `request.text()`; in FastAPI use `await request.body()`.
- **Challenge first**: a handler that requires a signature on every request fails the handshake and gets the webhook disabled.
- **Status codes differ by scope**: sheet webhooks retry 4xx (except 410) and 5xx, so a rejected callback is redelivered up to 14 times before the webhook is disabled. Plan webhooks retry only 408, 429, 502, 503, 504 and timeouts, so a 400 or 500 from a plan webhook's handler disables it at once. Return 503 for a temporary failure, because both scopes retry it.
- **Status change callbacks** carry a non-null `newWebhookStatus`. The docs don't say whether they also have an `events` array, so check the field and treat `events` as optional.
- **No replay protection** in the signature: the body's `timestamp` and `nonce` are signed, but Smartsheet prescribes no check and doesn't say whether a retried callback keeps its `nonce`. Prefer your own idempotency key built from the event's content.
- **Secret per webhook**: a handler serving several webhooks needs the secret for the matching `webhookId`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Webhook shows `DISABLED_VERIFICATION_FAILED` | Challenge not echoed, non-200 response, or wrong header name |
| Signature never matches | Body was parsed and re-serialised, wrong `sharedSecret` (for example after a reset), or secret from a different webhook |
| Length mismatch errors in `timingSafeEqual` | Compare equal-length buffers; check lengths first |
| Works locally, fails in prod | A proxy altered the body, or the endpoint is not on an allowed port |
