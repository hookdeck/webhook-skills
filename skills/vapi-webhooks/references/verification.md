# Vapi Webhook Verification

## There Is No Single "Vapi Signature"

Most providers sign every payload with one fixed HMAC and header. **Vapi does
not.** Authentication on the Server URL is **opt-in and per-endpoint**: until you
attach a credential, the endpoint has **no authentication at all**. When you do
attach one, you pick which of four mechanisms it uses. So "how do I verify a Vapi
webhook?" has four answers depending on the credential you configured.

The four credential types (created in the dashboard as **Custom Credentials**,
referenced by `credentialId` on the `server` object):

1. **Bearer Token** — a literal shared secret in `Authorization: Bearer <token>`.
2. **Legacy `X-Vapi-Secret`** — the same shared secret, in `X-Vapi-Secret`.
3. **OAuth 2.0 (client credentials)** — Vapi presents a token it fetched from you.
4. **HMAC** — a signature you configure (algorithm, header, payload format).

Vapi provides **no official server-side SDK helper** for verifying any of these,
and there is **no documented source-IP allowlist**. Verification is manual.

> A `verifyVapiSignature(...)` middleware name appears in one CLI tutorial
> snippet with no implementation and no matching SDK export. **It is a
> placeholder in example code, not a real function** — do not import or call it.

## Recommended: The Shared Secret (Bearer / X-Vapi-Secret)

This is the simplest, most common, and only **fully specified** path — one exact
header, one exact comparison. It is a **literal string compare**; nothing is
hashed. Read the token from whichever header your credential is configured to
send, then compare against your stored secret with a **timing-safe** comparison.

### Node.js

```javascript
const crypto = require('crypto');

function safeEqual(a, b) {
  const ab = Buffer.from(a), bb = Buffer.from(b);
  // timingSafeEqual throws on length mismatch — guard first
  return ab.length === bb.length && crypto.timingSafeEqual(ab, bb);
}

// Bearer Token sends `Authorization: Bearer <token>`; the legacy credential
// (and the old server.secret field) sends the raw token in `X-Vapi-Secret`.
function extractToken(headers) {
  const auth = headers['authorization'];
  if (auth) return auth.startsWith('Bearer ') ? auth.slice(7) : auth;
  return headers['x-vapi-secret'];
}

function verifyVapiSecret(headers, expected) {
  const token = extractToken(headers);
  if (!token || !expected) return false;
  return safeEqual(token, expected);
}
```

### Python

```python
import hmac

def verify_vapi_secret(headers, expected: str | None) -> bool:
    auth = headers.get("authorization")
    if auth:
        token = auth[7:] if auth.startswith("Bearer ") else auth
    else:
        token = headers.get("x-vapi-secret")
    if not token or not expected:
        return False
    return hmac.compare_digest(token, expected)
```

On a mismatch return `401`. On success, process the message and return `200`
(with the required JSON body for the four request/response types).

## Option: OAuth 2.0 (client credentials)

With an OAuth 2.0 credential, Vapi calls **your** token endpoint with a client
ID/secret, expects back:

```json
{ "access_token": "…", "token_type": "Bearer", "expires_in": 3600 }
```

and then sends that `access_token` as `Authorization: Bearer <token>` on webhook
deliveries, refreshing automatically when it expires. To verify, validate the
presented bearer token the way you validate any access token you issued (e.g.
introspect it or check your signing) — it is *your* token, not a Vapi signature.

## Option: HMAC (verified against live deliveries, 2026-08-12)

If you attach an HMAC credential, Vapi signs each delivery and puts a **bare
digest** in a signature header. The construction below was **confirmed by
recomputing the digest of real Vapi sandbox deliveries** (SHA-256, key used
verbatim).

**What Vapi signs depends on the credential's "Payload Format":**

- **`{body}` (recommended):** the signed content is the **raw request body**:
  `HMAC-SHA256(rawBody, secret)`. Self-contained and verifiable on its own. **Prefer this format.**
- **`{timestamp}.{body}` (Vapi's default):** the signed content is
  `<timestamp> + "." + rawBody`, where `<timestamp>` is Vapi's **send-time epoch
  in milliseconds**, delivered in the **timestamp header** (default `x-timestamp`).
  You **must keep the timestamp header enabled** for this format — with it off,
  the value Vapi signed with is never delivered and the signature is
  **impossible to verify** (confirmed: no payload field reproduces it).

Both formats share:

- **Signature header:** `x-signature` by default (configurable), a bare digest —
  not a structured `t=…,v1=…` value.
- **Algorithm:** `sha256` default (`sha1` / `sha512` selectable).
- **Encoding:** `hex` default (`base64` selectable).
- **Secret:** used **verbatim** as the HMAC key. Vapi has a "secret is base64"
  toggle — leave it **off** unless you intend the key to be base64-decoded first.

> **Gotcha — two different timestamps.** The signing timestamp is the value in the
> **timestamp header** (`x-timestamp`), *not* `message.timestamp` in the body —
> they differ by tens of milliseconds (the header is stamped at send time). Sign
> with the header value.

> **Hookdeck compatibility.** Set your Vapi credential to `{body}` when routing
> through Hookdeck.

```javascript
const crypto = require('crypto');

// Verify a Vapi HMAC delivery. Set `format` to match the credential's Payload Format.
function verifyVapiHmac(rawBody, headers, {
  secret,
  format = 'body',              // 'body' → {body}; 'timestamp.body' → {timestamp}.{body}
  algorithm = 'sha256',
  signatureHeader = 'x-signature',
  timestampHeader = 'x-timestamp',
  encoding = 'hex',
}) {
  const provided = headers[signatureHeader.toLowerCase()];
  if (!provided || !secret) return false;

  let signed = rawBody;
  if (format === 'timestamp.body') {
    const ts = headers[timestampHeader.toLowerCase()];
    if (!ts) return false;       // the timestamp header MUST be enabled for this format
    signed = `${ts}.${rawBody}`; // ts is epoch-ms; optionally reject stale timestamps here
  }

  const expected = crypto.createHmac(algorithm, secret).update(signed).digest(encoding);
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Known-answer vectors (self-computed — reproduce to check your implementation)

Secret `whsec_vapi_sample_key`, body (107 bytes):

```
{"message":{"type":"status-update","status":"ended","timestamp":1786546871392,"call":{"id":"call_kat123"}}}
```

- **`{body}`** → `HMAC-SHA256(body, secret)` hex =
  `bf7be5b3be319cba484d93d31bc820376566161a3a0a442c3b9292fc599a15e4`
- **`{timestamp}.{body}`** with `x-timestamp: 1786546871433` →
  `HMAC-SHA256("1786546871433." + body, secret)` hex =
  `708dd047594968a1403c7e1695e89d3e0898ad57e0c6990ace3576f9a0259184`

Match your verifier against these before trusting it in production.

## Common Gotchas

- **No auth unless you add it.** A fresh Server URL is unauthenticated. Attach a
  credential before going to production.
- **Pick your header by credential type.** Bearer/OAuth → `Authorization`; the
  legacy/`server.secret` path → `X-Vapi-Secret`. The example handler checks both.
- **The shared secret is a literal compare, not a hash.** Don't HMAC it.
- **HMAC signs by Payload Format.** `{body}` signs the raw body; `{timestamp}.{body}`
  signs `x-timestamp` + `.` + raw body (verified). Prefer `{body}` — it's
  self-contained and Hookdeck-compatible. For `{timestamp}.{body}`, the timestamp
  header must be on or the signature can't be verified.
- **Sign with the `x-timestamp` header, not `message.timestamp`.** They differ.
- **Use a timing-safe comparison** (`crypto.timingSafeEqual` /
  `hmac.compare_digest`) and guard length mismatch, which throws in Node.
- **Event type is `message.type`**, nested — not a top-level field, and not the
  `type` shown in an informal CLI tutorial.
- **Respond in time.** `assistant-request` has a hard ~7.5s timeout, and the four
  request/response types need a JSON body — a bare `200` breaks the call.

## Debugging Verification Failures

- **`401` on every request:** confirm `VAPI_WEBHOOK_SECRET` matches the token
  your credential sends (watch trailing whitespace), and that you read the right
  header for your credential type.
- **Nothing arrives:** a more specific Server URL (Tool > Assistant > Phone
  Number > Org) is overriding the one you're watching, or the credential/URL
  isn't attached at the level you expect.
- **Calls fail on inbound / tool use:** you're returning a bare `200` for a
  request/response type — return the required JSON body (and beat the ~7.5s
  `assistant-request` timeout).

## Full Documentation

- [Server Authentication](https://docs.vapi.ai/server-url/server-authentication)
- [Server URL](https://docs.vapi.ai/server-url)
- [Server Events](https://docs.vapi.ai/server-url/events)
