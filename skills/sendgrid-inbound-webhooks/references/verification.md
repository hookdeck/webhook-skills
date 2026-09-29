# How to Verify SendGrid Inbound Parse Webhook Signatures

## Start Here: Capture the Raw Body Before Anything Parses It

This is the one thing that makes Inbound Parse verification different from
every other SendGrid webhook, and SendGrid calls it out under an explicit
WARNING:

> **Warning** — Some web frameworks automatically parse multipart data and
> separate file uploads from the rest of the request body. This can break
> signature validation.
>
> To ensure signature validation works correctly:
> - Do not parse or modify the request body before validating the signature.
> - Use the raw request body exactly as it was received to generate your
>   signature hash.

The body is `multipart/form-data`. Any framework convenience that reads it —
`express.urlencoded()`, `multer()`, `req.formData()`, `request.form()` — either
consumes the stream or hands you a reassembled structure whose bytes no longer
match what was signed. Once that has happened the original bytes are gone and
verification can never succeed.

### Per-framework raw-body capture

**Express** — mount `express.raw()` on the route, ahead of any multipart
middleware, with a limit large enough for a 30 MB message:

```javascript
app.post(
  '/webhooks/sendgrid-inbound',
  express.raw({ type: 'multipart/form-data', limit: '30mb' }),  // or type: '*/*'
  handler
);
```

Never `express.urlencoded()`, `express.json()`, or a bare `multer()` on this
route. If `req.body` is not a `Buffer` in your handler, something upstream
already parsed it.

**Next.js App Router** — read the bytes, verify, then re-parse them:

```typescript
const buf = Buffer.from(await req.arrayBuffer());
if (!verify(buf, sig, ts)) return new NextResponse('Invalid signature', { status: 400 });
// Re-parse the SAME bytes. `new Response(...)` is a standards-compliant
// multipart parser available in Node 18+ with no dependency.
const form = await new Response(buf, {
  headers: { 'content-type': req.headers.get('content-type')! },
}).formData();
```

`await req.formData()` first is unrecoverable — the raw bytes are not retained.

**FastAPI** — `await request.body()` **first**:

```python
raw = await request.body()      # FIRST. Starlette caches this…
if not verify(raw, sig, ts):
    return Response("Invalid signature", status_code=400)
form = await request.form()     # …so this replays the cached bytes safely.
```

Calling `await request.form()` first consumes the stream; a later
`await request.body()` returns nothing useful. Order is load-bearing.

## The Signature Scheme

**This is ECDSA, not HMAC.** There is no shared secret and no
`crypto.createHmac` / `hmac.new` anywhere in the verify path.

| Property | Value |
|----------|-------|
| Algorithm | ECDSA with SHA-256 |
| Curve | NIST P-256 (`prime256v1`) |
| Signature header | `X-Twilio-Email-Event-Webhook-Signature` |
| Timestamp header | `X-Twilio-Email-Event-Webhook-Timestamp` |
| Signed content | `timestamp` + raw request body, concatenated as **raw bytes**, no separator, then SHA-256 hashed |
| Signature encoding | base64 of an **ASN.1/DER** ECDSA signature (a `SEQUENCE` of `r`, `s`) |
| Public key | `policy.signature.public_key` — **base64 DER SubjectPublicKeyInfo**, not PEM |

Yes, the header names say `Event-Webhook` even on Inbound Parse requests. That
is verbatim from the docs, not a copy-paste error — the Inbound Parse security
docs state that verification is "functionally similar to verifying SendGrid
Event Webhook Signatures" and reuse the same two headers.

### On the curve

The prose does not name the curve. It is **derived from the documented key**:
decoding the public key in SendGrid's own security-policy response
(`MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEmgmjvPAR/…`) with
`openssl pkey -pubin -inform DER -text` reports `ASN1 OID: prime256v1`,
`NIST CURVE: P-256`, 256-bit. Every SendGrid key observed so far is P-256, and
the standard libraries below read the curve out of the key anyway — so you do
not need to hardcode it.

### On the DER signature

SendGrid's own reference implementation base64-decodes the header and does an
ASN.1 unmarshal into `{r, s}`. You do **not** need to do that yourself:

- Node's `crypto.verify('sha256', …)` defaults to `dsaEncoding: 'der'`.
- Python `cryptography`'s `ec.ECDSA(hashes.SHA256())` expects DER.

Both accept the decoded header bytes directly. Do **not** convert to raw/P1363
(fixed-width `r || s`) form — that is a different encoding and will fail.

## Implementation

### Node.js (Express, Next.js) — manual, using `crypto`

```javascript
const crypto = require('crypto');

function verifyInboundParse(publicKeyB64, rawBody, signature, timestamp) {
  if (!publicKeyB64 || !rawBody || !signature || !timestamp) return false;
  try {
    // base64 DER SPKI -> KeyObject. NOT PEM.
    const key = crypto.createPublicKey({
      key: Buffer.from(publicKeyB64, 'base64'),
      format: 'der',
      type: 'spki',
    });
    const signed = Buffer.concat([
      Buffer.from(String(timestamp), 'utf8'),
      Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody),
    ]);
    return crypto.verify('sha256', signed, key, Buffer.from(signature, 'base64'));
  } catch {
    return false;  // malformed key or signature — reject, never throw
  }
}
```

If you would rather keep PEM in your config, wrap the base64 yourself:

```javascript
const pem = `-----BEGIN PUBLIC KEY-----\n${publicKeyB64}\n-----END PUBLIC KEY-----\n`;
const key = crypto.createPublicKey(pem);
```

Both forms produce the same `KeyObject`.

### Python (FastAPI) — manual, using `cryptography`

```python
import base64
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.exceptions import InvalidSignature


def verify_inbound_parse(public_key_b64: str, raw_body: bytes,
                         signature: str, timestamp: str) -> bool:
    if not (public_key_b64 and raw_body and signature and timestamp):
        return False
    try:
        # load_der_public_key, NOT load_pem_public_key.
        key = serialization.load_der_public_key(base64.b64decode(public_key_b64))
        if not isinstance(key, ec.EllipticCurvePublicKey):
            return False
        key.verify(
            base64.b64decode(signature),           # DER (r, s) — pass through
            timestamp.encode("utf-8") + raw_body,  # raw bytes, no separator
            ec.ECDSA(hashes.SHA256()),
        )
        return True
    except (InvalidSignature, ValueError, TypeError):
        return False
```

### Why not the `@sendgrid/eventwebhook` SDK?

SendGrid publishes ECDSA helpers in its API libraries, and they are the right
choice for the **Event Webhook**. They are **not safe for Inbound Parse**.

The Node helper's `verifySignature` does this internally:

```javascript
let timestampPayload = Buffer.isBuffer(payload) ? payload.toString() : payload;
```

`Buffer.toString()` decodes as UTF-8. An Inbound Parse body contains raw binary
attachment bytes, and every byte that is not valid UTF-8 becomes `U+FFFD` —
a different byte sequence, a different SHA-256, a failed verification. This is
reproducible: sign a multipart body containing `0x89 0x50 0x4e 0x47 0xff 0xfe`
(a PNG header), and the helper returns `false` on a signature that
`crypto.verify` confirms is valid. The examples in this skill include a
regression test for exactly that case.

`convertPublicKeyToECDSA` also takes PEM (`PublicKey.fromPem`), so the base64
DER value SendGrid hands you needs wrapping regardless.

The helper was written for the Event Webhook's JSON body, where the
stringification is harmless. For Inbound Parse, verify on the raw `Buffer`.

## OAuth Verification

An independent, second path — not a replacement for signature verification.

When the security policy includes an `oauth` block (`client_id`,
`client_secret`, `token_url`, `scopes`), SendGrid performs a client-credentials
grant against the `token_url` **you** designate and sends the resulting token on
every Inbound Parse POST:

```
Authorization: Bearer <OAUTH_ACCESS_TOKEN>
```

SendGrid does not interpret the token — it is opaque to them. You validate it
against your own authorization server (JWKS signature + `iss` / `aud` / `exp`
checks for a JWT, or RFC 7662 introspection for an opaque token). This skill
cannot verify it cryptographically on your behalf; the examples ship a
`validateAccessToken()` seam with a placeholder implementation to replace.

### The response contract that actually matters

SendGrid **caches** the access token and reuses it across requests. When the
token is expired or invalid, your rejection is the only signal that makes
SendGrid fetch a fresh one. The docs require a 4xx status **and** a body
containing one of exactly these three strings (RFC 6750 §3.1):

| Status | Body must contain | When |
|--------|-------------------|------|
| `400` | `invalid_request` | Missing/duplicated/malformed token or parameter |
| `401` | `invalid_token` | Expired, revoked, malformed, otherwise invalid token |
| `403` | `insufficient_scope` | Token valid but lacks the required privileges |

> *"Upon receiving any of these error codes from your webhook, SendGrid will
> request a new OAuth token from your OAuth service and retry the webhook."*

A bare `401` with an empty body, or a custom message like
`{"error":"unauthorized"}`, leaves the stale token cached and every subsequent
delivery fails the same way. Emit the literal string.

## Optional: Replay Protection

The timestamp is a real Unix timestamp, not a nonce, so a freshness window is
meaningful. Keep it **opt-in** and document the tolerance — do not hard-fail on
clock skew by default, because silently dropping inbound mail is worse than
accepting a slightly old signed request:

```javascript
const maxAge = Number(process.env.SENDGRID_INBOUND_MAX_AGE_SECONDS || 0);
if (maxAge > 0) {
  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > maxAge) return false;
}
```

Run NTP on the receiving host before enabling this.

## Do Not Fabricate

Things that do **not** exist for Inbound Parse, however plausible they sound:

- **No source-IP allowlist.** SendGrid publishes none for Inbound Parse POSTs.
  The `sender_ip` form field is the *email sender's* IP — attacker-influenced
  data, not authentication. Never allowlist on it.
- **No other `X-Twilio-Email-*` headers.** Only the signature and timestamp
  headers above.
- **No event type names**, no `type` field, no `event` field. See
  [overview.md](overview.md).
- **No Standard Webhooks headers** (`webhook-id`, `webhook-timestamp`,
  `webhook-signature`). SendGrid does not use that spec.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| No signature header at all | No security policy attached to the Parse Setting, or the policy has no `signature` block — the webhook is genuinely unsigned |
| Fails only when the email has attachments | The body was stringified or re-parsed before verification. Classic `@sendgrid/eventwebhook` / `toString()` symptom |
| Fails on every request, text-only included | Middleware parsed the body first (`express.urlencoded`, `multer`, `request.form()` before `request.body()`), or the timestamp was omitted from the signed content |
| `ERR_OSSL_UNSUPPORTED` / "Could not deserialize key data" | The public key was treated as PEM. It is base64 DER SPKI — decode it, or add the PEM armour |
| Works locally, fails behind a proxy/ingress | Something is re-encoding the body. Check for gzip/charset rewriting, body-size truncation, or a WAF that normalises multipart |
| Fails only with attachments, and only when routed through a gateway | The gateway decoded the body as UTF-8. Lossless for text-only mail, lossy the moment an attachment carries non-UTF-8 bytes. Verify at the edge, or switch the Parse Setting to `send_raw: true` so attachments arrive base64-encoded and the body stays ASCII. On Hookdeck this is a rollout stage, not a permanent limit — see the gateway section in SKILL.md |
| Intermittent failures under load | Body-size limit too low — a 30 MB message needs a 30 MB limit; truncated bodies never verify |
| Verified, then `JSON.parse` throws | You parsed `dkim`. It is not JSON |

Quick sanity check that your key is what you think it is:

```bash
echo "$SENDGRID_INBOUND_PUBLIC_KEY" | base64 -d | openssl pkey -pubin -inform DER -text -noout
# Public-Key: (256 bit) / ASN1 OID: prime256v1 / NIST CURVE: P-256
```

## Source Documentation

- [Securing your Parse Webhooks](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/securing-your-parse-webhooks)
- [Event Webhook security features](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/getting-started-event-webhook-security-features) — the signature and OAuth mechanics the Inbound Parse docs refer back to
- [Setting up the Inbound Parse Webhook](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
