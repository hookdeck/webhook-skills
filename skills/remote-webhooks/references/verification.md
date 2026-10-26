# How to Verify Remote Webhook Signatures

## How It Works

Each request has two custom headers:

1. `X-Remote-Timestamp`: Unix time in **milliseconds**
2. `X-Remote-Signature`: the bare lowercase hex digest (64 characters, no prefix)

Remote computes HMAC-SHA256 with the callback's `signing_key` over:

```
message = raw_request_body + ":" + timestamp
```

The key is the `signing_key` string as UTF-8 bytes, not hex- or base64-decoded.

## Implementation

Build the message as bytes. Body first, then a colon, then the timestamp header exactly as received.

### Node.js

```javascript
const message = Buffer.concat([rawBody, Buffer.from(':'), Buffer.from(timestamp, 'latin1')]);
const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8')).update(message).digest();
if (!/^[0-9a-fA-F]{64}$/.test(signature)) return false;      // validate before decoding
const received = Buffer.from(signature.toLowerCase(), 'hex');
return received.length === expected.length && crypto.timingSafeEqual(received, expected);
```

### Python

```python
message = b"".join([raw_body, b":", timestamp.encode("latin-1")])
expected = hmac.new(secret.encode("utf-8"), message, hashlib.sha256).digest()
if not re.fullmatch(r"[0-9a-fA-F]{64}", signature):
    return False
return hmac.compare_digest(bytes.fromhex(signature), expected)
```

Full versions: [Express](../examples/express/src/index.js), [Next.js](../examples/nextjs/lib/verify-remote.ts), [FastAPI](../examples/fastapi/main.py).

## Published Test Vector

Remote's [verifying webhooks](https://developer.remote.com/docs/verifying-webhooks) page gives a worked
example. All three example test suites include it:

- Secret: `wkyzvs764ifdrpct2naqhksmq4`
- `X-Remote-Timestamp`: `1677816097219`
- Body: the compact 376-byte JSON for an `employment.onboarding_task.completed` event (matches the docs' Content-Length; the pretty-printed version is a different byte string)
- Expected `X-Remote-Signature`: `e3f4092f158983aea32ab25f6fecc59f64b26d45fadbed6409893f3a882abef7`

If your code does not reproduce that digest, the message construction is wrong.

## Common Gotchas

- **Raw body.** Verify the exact bytes. Parsing and re-serialising changes key order or spacing and breaks the digest. In Express use `express.raw({ type: '*/*' })`; in Next.js `request.arrayBuffer()`; in FastAPI `await request.body()`.
- **Order.** Body, then `:`, then timestamp. Not timestamp first.
- **Millisecond timestamp.** Not seconds. Matters only if you add a tolerance check.
- **Compare as one digest.** No prefix such as `sha256=`, no list splitting. Hex case does not matter: lowercase both sides.
- **Validate before decoding.** `Buffer.from(sig, 'hex')` silently drops bad characters, so check for exactly 64 hex characters first.
- **Timestamp tolerance is off by default.** Hookdeck retries and replays resend the original headers, and Hookdeck applies no tolerance itself, so a fixed window rejects legitimate deliveries. To opt in, set `REMOTE_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off); the examples compare it against the millisecond timestamp.
- **4xx and 5xx are final.** Remote counts them as delivered and never retries them.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always 401 | Wrong key: use the `signing_key` from `POST /v1/webhook-callbacks` for that environment (sandbox and production differ) |
| Fails only on some events | Body was parsed or re-encoded before verifying |
| Fails with a proxy or Hookdeck in front | Something modified the body bytes, or you verify with a different secret than the callback's |
| Test vector fails | Message built as `timestamp:body`, key decoded as hex/base64, or pretty-printed body used |
