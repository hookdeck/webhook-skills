# How to Verify Paypercut Webhook Signatures

## How Does Paypercut Sign Webhooks?

Every delivery carries `Paypercut-Signature: t=<unix seconds>,v1=<hex>`. The docs' example is `t=1768991448,v1=51844041050a81c3a22a15e3e6cb29167d4265f7068764671a488027931f3630` (the page's format line prints `t=,v1=<hex_signature>` with the timestamp placeholder missing).

```
v1 = hex( HMAC_SHA256( secret, t + "." + raw_body ) )
```

- `t` is the Unix time in seconds, used as the exact string in the header.
- The key is the endpoint secret's UTF-8 bytes (Paypercut's Go sample uses `[]byte(webhookSecret)`).
- The header may carry several `v1=` entries (key rotation): accept if any matches. Ignore other keys such as `v0`.

## Implementation

Paypercut documents no SDK helper for verification, so verify manually. All three examples implement the same steps; see [examples/](../examples/).

1. Read the raw body as bytes. Don't parse or re-encode it.
2. Parse `t` and every `v1` from the header. No `t` or no `v1`: reject.
3. Build `bytes(t) + "." + raw_body`, HMAC-SHA256 it with the secret, hex-encode (lowercase).
4. For each `v1`: require exactly 64 hex characters, lowercase it, and compare in constant time.

```python
import hashlib, hmac

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = [p.strip().partition("=") for p in header.split(",")]
    t = next((v for k, _, v in parts if k == "t"), "")
    candidates = [v for k, _, v in parts if k == "v1"]
    if not t or not candidates:
        return False
    expected = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).hexdigest().encode()
    ok = False
    for c in candidates:
        c = c.encode()
        if len(c) == 64 and all(ch in b"0123456789abcdefABCDEF" for ch in c):
            ok |= hmac.compare_digest(c.lower(), expected)
    return ok
```

## Should I Reject Old Timestamps?

Not by default. Paypercut recommends checking `t` against a 300-second window, but Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window rejects legitimate retries. The examples offer an opt-in `PAYPERCUT_WEBHOOK_TOLERANCE_SECONDS` (unset or `0` = off). When it is set, `t` must be an integer and within that many seconds of now. Make your handler idempotent either way (`Paypercut-Delivery-Id`).

## Common Gotchas

- **Raw body:** `express.json()` before the check changes the bytes. Use `express.raw({ type: '*/*' })`, Next.js `await request.arrayBuffer()`, FastAPI `await request.body()`.
- **Don't reformat `t`:** `t=0001768991448` signs the string `0001768991448`, not `1768991448`.
- **Don't decode the secret** as hex or base64.
- **Bad hex:** `Buffer.from(sig, 'hex')` silently drops invalid characters. Validate length and alphabet first.
- **Empty bodies:** a request with no body (for example `GET`) is verified over zero bytes.
- **Status codes:** `401` for a signature failure, `400` for a bad payload, `500` for processing errors (Paypercut retries).

## How Do I Debug Verification Failures?

1. Log the raw header and body length; confirm the body wasn't parsed first.
2. Check you use this endpoint's secret, not another endpoint's (each has its own).
3. Behind a proxy or Hookdeck, check the body isn't re-encoded and the `Paypercut-Signature` header is passed through.
4. Recompute with the header's `t` exactly as written.
