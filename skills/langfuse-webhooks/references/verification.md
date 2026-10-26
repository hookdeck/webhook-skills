# How to Verify Langfuse Webhook Signatures

## How Does Langfuse Sign Webhooks?

Each delivery has a header:

```
x-langfuse-signature: t=<timestamp>,v1=<signature>
```

- `t` is the Unix timestamp (seconds) as a string.
- `v1` is the **lowercase hex** HMAC-SHA256 of `<t>.<raw request body>`, keyed with the webhook's
  signing secret as UTF-8 bytes.
- The header may carry more than one `v1=` entry (for example during secret rotation). Accept the
  delivery if **any** entry matches; ignore other keys such as `v0`.

Langfuse's own samples build `f"{timestamp}.{raw_body}".encode("utf-8")` and compare
`hmac.new(secret.encode("utf-8"), message, hashlib.sha256).hexdigest()` with the decoded `v1`
digest in constant time.

## Implementation

### Node.js

```javascript
const crypto = require('crypto');

function verifyLangfuseSignature(rawBody, header, secret) {
  let t;
  const sigs = [];
  for (const part of String(header || '').split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    const k = part.slice(0, i).trim(), v = part.slice(i + 1).trim();
    if (k === 't' && t === undefined) t = v;
    else if (k === 'v1') sigs.push(v);
  }
  if (!secret || !t || sigs.length === 0) return false;
  const expected = crypto.createHmac('sha256', Buffer.from(secret, 'utf8'))
    .update(Buffer.concat([Buffer.from(`${t}.`), rawBody])).digest();
  return sigs.some((s) =>
    /^[0-9a-fA-F]{64}$/.test(s) &&
    crypto.timingSafeEqual(Buffer.from(s.toLowerCase(), 'hex'), expected));
}
```

### Python

```python
import hashlib, hmac, re

def verify_langfuse_signature(raw_body: bytes, header: str, secret: str) -> bool:
    t, sigs = None, []
    for part in (header or "").split(","):
        k, sep, v = part.partition("=")
        if not sep:
            continue
        k, v = k.strip(), v.strip()
        if k == "t" and t is None:
            t = v
        elif k == "v1":
            sigs.append(v)
    if not secret or not t or not sigs:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).digest()
    return any(
        re.fullmatch(r"[0-9a-fA-F]{64}", s) and hmac.compare_digest(bytes.fromhex(s), expected)
        for s in sigs
    )
```

Full handlers with tests: [Express](../examples/express/), [Next.js](../examples/nextjs/), [FastAPI](../examples/fastapi/).

## Common Gotchas

- **Raw body.** Verify the bytes exactly as received. Use `express.raw({ type: '*/*' })` (not
  `express.json()`), `await request.arrayBuffer()` in Next.js, `await request.body()` in FastAPI.
  Re-serialising JSON changes whitespace and key order and breaks the MAC. Parse only after verifying.
- **Build the message as bytes.** Do not decode the body to a string and re-encode it.
- **Use `t` as sent.** Do not parse it to a number and format it back (leading zeros would change).
- **The secret is not decoded.** No hex or base64 decoding; UTF-8 bytes as shown in Langfuse.
- **Validate before decoding.** Node's `Buffer.from(sig, 'hex')` silently drops invalid
  characters, so check `^[0-9a-fA-F]{64}$` first, then compare equal-length buffers with
  `crypto.timingSafeEqual`. In Python compare `bytes` with `hmac.compare_digest`, never `str`.
- **Hex is case-insensitive.** Lowercase it (or decode both sides) before comparing.
- **Multiple `v1` entries.** Accept if any matches.
- **Timestamp window is off by default.** Hookdeck retries and replays resend the original headers
  and timestamp, and Hookdeck itself applies no tolerance, so rejecting old `t` would drop
  legitimate retries. Set `LANGFUSE_WEBHOOK_TOLERANCE_SECONDS` (for example `300`) to opt in; it
  rejects when `|now - t|` exceeds it or `t` is not an integer. Rely on idempotency (payload `id`
  plus `action`) for replay protection otherwise.
- **Status codes.** Missing header, malformed value or mismatch: `401`. A validly signed body that
  is not JSON: `400`.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Always `401` | Wrong secret (regenerated?), or body parsed/re-serialised before verifying |
| `401` only on some requests | Proxy or middleware altering the body (compression, charset, trailing newline) |
| `401` after enabling tolerance | Old `t` on a retry or replay; turn tolerance off or widen it |
| Works in tests, fails live | Test signs `JSON.stringify(obj)` but the handler receives different bytes; sign the exact bytes sent |
| Secret rejected | Secret was hex/base64-decoded; use it as plain UTF-8 |
