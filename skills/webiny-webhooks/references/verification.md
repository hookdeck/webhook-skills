# How to Verify Webiny Webhook Signatures

## How Does the Signature Work?

Webiny follows Standard Webhooks and sends three headers:

| Header | Value |
|--------|-------|
| `webhook-id` | Message ID, stable across retries |
| `webhook-timestamp` | Unix seconds |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries |

Signature = `base64(HMAC-SHA256(key, "{webhook-id}.{webhook-timestamp}.{raw body}"))`.

## What Is the HMAC Key?

Webiny 6.5.0's signer does this with the admin-entered secret before calling `standardwebhooks`:

```js
if (secret.startsWith("whsec_")) return secret;
const encoded = Buffer.from(secret).toString("base64");
return `whsec_${encoded}`;
```

The library then base64-decodes the part after `whsec_`, so the key is the secret's **raw UTF-8 bytes**. If you hand the original secret to the `standardwebhooks` or `svix` library yourself, it base64-decodes the free text instead, and every signature fails (or, worse, a few secrets decode to garbage without an error). The docs do not state the secret format; this comes from the signer source.

## How Do I Verify Manually?

```javascript
const crypto = require('crypto');

function resolveKey(secret) {
  if (!secret) return null;
  const key = secret.startsWith('whsec_')
    ? Buffer.from(secret.slice(6), 'base64')   // already Standard Webhooks base64
    : Buffer.from(secret, 'utf8');             // the normal Webiny case
  return key.length ? key : null;              // never accept an empty key
}

function verify(rawBody, headers, secret, toleranceSeconds = 0) {
  const key = resolveKey(secret);
  const p = headers['webhook-id'] ? 'webhook' : 'svix';
  const id = headers[`${p}-id`], ts = headers[`${p}-timestamp`], sig = headers[`${p}-signature`];
  if (!key || !id || !ts || !sig || !/^[1-9][0-9]*$/.test(ts)) return false;
  if (toleranceSeconds && Math.abs(Date.now() / 1000 - Number(ts)) > toleranceSeconds) return false;
  const expected = crypto.createHmac('sha256', key)
    .update(Buffer.concat([Buffer.from(`${id}.${ts}.`), rawBody])).digest();
  return sig.split(' ').some((entry) => {
    const [version, value] = entry.split(',');
    const got = Buffer.from(value || '', 'base64');
    return version === 'v1' && got.length === expected.length && crypto.timingSafeEqual(got, expected);
  });
}
```

Python:

```python
expected = base64.b64encode(
    hmac.new(key, f"{msg_id}.{ts}.".encode() + raw_body, hashlib.sha256).digest()
)
# Compare the base64 text, as Hookdeck does, so a malformed entry simply doesn't match
ok = any(
    v == "v1" and hmac.compare_digest(s.encode(), expected)
    for v, _, s in (e.partition(",") for e in signature.split(" "))
)
```

## Why Not Use the Webiny SDK or the standardwebhooks Library?

`createVerifyWebhookPayload` from `@webiny/sdk/webhooks` is the documented verifier for Node.js and works if you already use the SDK. It uses the standardwebhooks library underneath, which enforces a 5-minute timestamp window by default, so replays from Hookdeck or the Webiny admin with an old timestamp are likely to be rejected. The examples here use a dependency-free verifier that works in any language, matches Hookdeck's Webiny source, and has no timestamp window unless you set `WEBINY_WEBHOOK_TOLERANCE_SECONDS`.

## Common Gotchas

- **Raw body.** Verify the exact bytes. In Express use `express.raw({ type: '*/*' })` so any content type works; parse JSON afterwards.
- **Secret format.** Free text used as raw UTF-8 bytes, not base64. Paste it exactly as entered.
- **Empty secret.** If neither the webhook nor Webhook settings has a secret, Webiny signs with an empty key. Set one. Handlers must reject an empty key rather than verify against it.
- **svix-\* headers.** If `webhook-id` is absent, read `svix-id`, `svix-timestamp` and `svix-signature` instead (Hookdeck does the same).
- **Multiple signatures.** Try every `v1,` entry and ignore other versions such as `v1a`.
- **Timestamps.** Require a plain positive integer. Do not enforce a window by default: retries and replays resend the original timestamp.
- **Status codes.** A `4xx` is not retried by Webiny and marks the delivery as delivered in its log, so check your own logs for rejections.

## How Do I Debug Verification Failures?

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails | Secret not set in Webiny (empty key), or `WEBINY_WEBHOOK_SECRET` differs from the one entered |
| Fails only after adding the library | Library base64-decoded the free-text secret; use the manual verifier |
| Fails only through a proxy or framework | Body re-serialised or re-encoded; verify the raw bytes |
| Works, then fails after changing the secret | Webiny uses the webhook's secret before the global one; update the right one |
| Old replays rejected | A tolerance is configured; unset `WEBINY_WEBHOOK_TOLERANCE_SECONDS` |
