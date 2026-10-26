# How to Verify Pine Labs Webhook Signatures

## How It Works

Pine Labs signs every delivery with the Standard Webhooks scheme:

| Header | Value |
|--------|-------|
| `webhook-id` | Event ID. Stays the same when the webhook is resent |
| `webhook-timestamp` | Unix timestamp in seconds when the event was triggered |
| `webhook-signature` | One or more space-separated `v1,<base64>` entries |

1. Build the signed content: `{webhook-id}.{webhook-timestamp}.{raw request body}`.
2. HMAC-SHA256 it with the key and base64-encode the digest.
3. Compare in constant time with every `v1,` entry in `webhook-signature`. Any match is valid. Ignore other versions (such as `v1a`).

Pine Labs' docs: "Ensure that the webhook body remains unparsed."

## What Is the Key?

The secret key from the dashboard as its **raw UTF-8 bytes**. Pine Labs' worked example uses the secret `abc1234`, "encodes it to Base64" (`YWJjMTIzNA==`) and then base64-decodes that again to get the HMAC key, which is the original bytes. So `Buffer.from(secret, 'utf8')` is correct.

The key rule used by the examples (and by Hookdeck):

- Secret starts with `whsec_`: base64-decode the part after the prefix. Pine Labs doesn't issue these.
- Anything else: the secret's UTF-8 bytes.
- An empty key is rejected (fail closed).

## Worked Example From Pine Labs' Docs

| Input | Value |
|-------|-------|
| secret | `abc1234` |
| `webhook-id` | `msg_2nEfCaUDn9fynC9Kz2upo1QSydl` |
| `webhook-timestamp` | `1728543028` |
| body | `{"payload":"payload"}` |
| expected signature | `Ns46HrH+Nfu9dZtBUVvSLyrOD5JH0SAGlNo3M5yobfQ=` |

Both test suites include this vector.

## Implementation

### Node.js

See the core snippet in [SKILL.md](../SKILL.md) and [examples/express/src/index.js](../examples/express/src/index.js). Compare with `crypto.timingSafeEqual` on equal-length Buffers (check the length first, because it throws on a mismatch).

### Python

```python
import base64, hashlib, hmac

def verify_pine_labs(raw_body: bytes, msg_id: str, timestamp: str, signature_header: str, secret: str) -> None:
    if not (msg_id and signature_header and timestamp.isascii() and timestamp.isdigit() and not timestamp.startswith("0")):
        raise ValueError("Missing or malformed headers")
    key = base64.b64decode(secret[6:]) if secret.startswith("whsec_") else secret.encode("utf-8")
    if not key:
        raise ValueError("Empty signing key")
    expected = hmac.new(key, f"{msg_id}.{timestamp}.".encode() + raw_body, hashlib.sha256).digest()
    for entry in signature_header.split(" "):
        version, _, sig = entry.partition(",")
        if version == "v1" and sig:
            try:
                if hmac.compare_digest(base64.b64decode(sig), expected):
                    return
            except ValueError:
                continue
    raise ValueError("No matching signature")
```

### Header fallback

Read `webhook-id`, `webhook-timestamp` and `webhook-signature`. When `webhook-id` is absent, read `svix-id`, `svix-timestamp` and `svix-signature` instead, as Hookdeck does. Pass the three values to the verifier under whichever names it expects.

## Common Gotchas

- **Don't use the `standardwebhooks` or `svix` libraries.** They base64-decode the secret, so they derive a different key from Pine Labs' raw string secret and every delivery fails.
- **Use the raw body.** Parsing and re-serialising JSON changes the bytes. In Express use `express.raw({ type: '*/*' })` so any content type works. In Next.js use `request.text()`. In FastAPI use `await request.body()`.
- **Don't add `whsec_`.** Paste the secret key exactly as shown in the Pine Labs dashboard, without adding a whsec_ prefix.
- **No timestamp window by default.** Hookdeck retries and replays resend the original timestamp. Set `PINE_LABS_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds to opt in. The timestamp must be a plain positive integer.
- **Several signatures.** The header can hold more than one `v1,...` entry. Try each.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every delivery fails | A `whsec_` prefix was added, the secret is from the wrong environment (UAT vs production), or a library base64-decoded the secret |
| Fails only on some deliveries | Body re-serialised by middleware, or a proxy changed the bytes |
| `Missing signature headers` | The proxy dropped the `webhook-*` headers, or you're behind Hookdeck and need the `svix-*` fallback |
| Old retries rejected | `PINE_LABS_WEBHOOK_TOLERANCE_SECONDS` is set |
| `500 Webhook secret not configured` | `PINE_LABS_WEBHOOK_SECRET` is unset (handlers fail closed) |
