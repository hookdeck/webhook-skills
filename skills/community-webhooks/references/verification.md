# How to Verify Community Webhook Signatures

## Why Signature Verification Matters

Your Community webhook endpoint is a public HTTPS URL. Anyone who discovers it
can POST arbitrary JSON to it. Community signs every payload so you can prove a
request originated from Community and was not modified in transit. Without
verification, an attacker could forge `member.deleted` events to wipe contacts,
or forge `message.inbound` events to trigger your automations.

## How It Works

Community uses **HMAC-SHA256, hex-encoded**, in a Stripe-style header. This is
**not** the [Standard Webhooks](https://www.standardwebhooks.com/) spec — there
are no `webhook-id` / `webhook-timestamp` / `webhook-signature` headers.

Every payload carries a single header (lowercase in the docs):

```http
community-signature: t=1711666033,v1=b777f6ae2497ae95e99811c88b28d8ba377c95d615905963c68fae4c800de48d
```

| Field | Meaning |
|-------|---------|
| `t` | The Unix timestamp **in seconds** at which the request was generated |
| `v1` | The HMAC-SHA256 signature, lowercase hex (64 characters) |

The signed content is the concatenation of the timestamp, a literal `.`
character, and the **raw request body**:

```
signed_content = "{t}" + "." + raw_body
signature      = HMAC_SHA256(signature_secret, signed_content)   # hex
```

The HMAC key is the **signature secret** shown in the Community Dashboard when
the webhook is created or edited (Settings → Integrations → Webhooks). It is
per-webhook, not account-wide, and it is **not** the `community_api`-prefixed
Async REST API bearer token.

Community also documents two transport safeguards alongside the signature: only
HTTPS endpoints are accepted, and SSL certificates are verified as valid and for
the correct host. There is **no** documented source-IP allowlist — do not build
one from guessed ranges.

## Is There an SDK?

**No.** Community does not publish an official SDK with webhook verification in
any language. Implement the HMAC directly using your standard library, as shown
below. There is also no handshake, challenge, or subscription-confirmation step
to answer.

## Implementation

### Node.js / JavaScript

```javascript
const crypto = require('crypto');

/**
 * Verify a Community webhook signature.
 *
 * @param {string|Buffer} rawBody - The RAW request body (never re-serialized JSON)
 * @param {string|undefined} signatureHeader - The `community-signature` header value
 * @param {string} secret - The webhook's signature secret
 * @param {number} toleranceSeconds - 0 disables the staleness check (default)
 */
function verifyCommunitySignature(rawBody, signatureHeader, secret, toleranceSeconds = 0) {
  if (!signatureHeader || !secret) return false;

  // Parse "t=...,v1=..." by splitting on "," then "=".
  // Do NOT regex the whole header as one blob and do NOT assume field order.
  const fields = {};
  for (const part of signatureHeader.split(',')) {
    const i = part.indexOf('=');
    if (i === -1) continue;
    fields[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }

  const timestamp = fields.t;
  const signature = fields.v1; // unknown scheme versions are unsupported, not accepted
  if (!timestamp || !signature) return false;

  // Optional staleness check — see "Timestamp tolerance" below.
  if (toleranceSeconds > 0) {
    const ts = Number.parseInt(timestamp, 10);
    if (Number.isNaN(ts)) return false;
    if (Math.abs(Math.floor(Date.now() / 1000) - ts) > toleranceSeconds) return false;
  }

  const body = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : rawBody;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`, 'utf8')
    .digest('hex');

  // Constant-time comparison; timingSafeEqual throws on length mismatch.
  // Lowercase the incoming signature first: hex is case-insensitive.
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature.toLowerCase()),
      Buffer.from(expected)
    );
  } catch {
    return false;
  }
}
```

### Python

```python
import hashlib
import hmac
import time


def verify_community_signature(
    raw_body: bytes,
    signature_header: str | None,
    secret: str | None,
    tolerance_seconds: int = 0,
) -> bool:
    """Verify a Community webhook signature.

    `raw_body` must be the RAW request bytes, never re-serialized JSON.
    `tolerance_seconds=0` disables the staleness check (the default).
    """
    if not signature_header or not secret:
        return False

    # Parse "t=...,v1=..." by splitting on "," then "=" — no assumed order.
    fields: dict[str, str] = {}
    for part in signature_header.split(","):
        key, sep, value = part.partition("=")
        if sep:
            fields[key.strip()] = value.strip()

    timestamp = fields.get("t")
    signature = fields.get("v1")  # unknown scheme versions are unsupported
    if not timestamp or not signature:
        return False

    if tolerance_seconds > 0:
        try:
            ts = int(timestamp)
        except ValueError:
            return False
        if abs(int(time.time()) - ts) > tolerance_seconds:
            return False

    signed_content = timestamp.encode("utf-8") + b"." + raw_body
    expected = hmac.new(
        secret.encode("utf-8"), signed_content, hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(expected, signature.lower())
```

## Timestamp tolerance

Community's documentation specifies **no tolerance window** for `t`. A
replay/staleness check is therefore a hardening step *you* choose to add — it is
not a documented Community requirement, and the examples in this skill ship with
it **disabled by default** (`COMMUNITY_WEBHOOK_TOLERANCE_SECONDS=0`).

If you enable one, make the window comfortably larger than an hour. Community
retries a failed delivery for up to an hour from the first attempt, so a short
window risks rejecting legitimate retries if the original timestamp is reused.
Deduplicating on the event `id` (which you must do anyway for Community's
at-least-once delivery) already gives you most of the replay protection a
tolerance window would.

## Common Gotchas

- **Use the raw body, always.** `JSON.parse` → `JSON.stringify` (or
  `json.loads` → `json.dumps`) reorders keys and changes whitespace, so the
  bytes no longer match what Community signed. In Express use
  `express.raw({ type: 'application/json' })`; in Next.js use
  `await request.text()`; in FastAPI use `await request.body()`.
- **Sign `{t}.{body}`, not the body alone.** Forgetting the timestamp and the
  literal `.` is the single most common cause of failures.
- **Header name casing.** The docs write `community-signature` in lowercase.
  Node lowercases incoming header names, so `req.headers['community-signature']`
  works; other stacks may preserve the sender's casing, so look it up
  case-insensitively.
- **Parse the header properly.** Split on `,` then on the first `=`. Do not
  assume `t` comes before `v1`, and do not match the whole value with one
  regex.
- **Reject unknown scheme versions.** Only `v1` is defined. If a future `v2`
  appears, treat it as unsupported rather than silently accepting the request.
- **Use a constant-time comparison.** `crypto.timingSafeEqual` /
  `hmac.compare_digest`. Wrap `timingSafeEqual` in a `try` — it throws when the
  buffers differ in length, which is exactly what a malformed signature looks
  like.
- **Compare hex case-insensitively.** `0xAB` and `0xab` are the same byte, so
  lowercase the incoming `v1` before comparing. Community's documented example is
  lowercase and this has not been observed to vary, but a case-sensitive compare would reject
  a signature that is arithmetically correct. Normalizing case leaks nothing
  about the secret, so it costs nothing to be lenient here.
- **One secret per webhook.** If you have several webhooks pointing at the same
  service, each carries its own secret; route to the right secret per endpoint.
- **Don't use the API token.** The `community_api`-prefixed Async REST API
  bearer token is a different credential and will never produce a matching
  signature.

## How to Debug Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| Every request fails, signature length is 64 hex chars | Signed content is wrong — check you are hashing `` `${t}.${rawBody}` `` and not just the body |
| Fails only for some payloads (e.g. non-ASCII, emoji in `text`) | The body was re-serialized. Hash the raw bytes / UTF-8 string exactly as received |
| Fails after adding a body-parser or middleware | A JSON parser consumed the stream before your handler. Register the raw-body parser on the webhook route only |
| `TypeError: Input buffers must have the same byte length` | You called `timingSafeEqual` without the `try/catch` — a malformed or truncated signature has a different length |
| Works locally, fails in production | Wrong secret for that webhook (each webhook has its own), or a proxy/CDN rewriting the body |
| Signature header missing entirely | Some proxies strip unknown headers; check that `community-signature` survives your ingress |
| Legitimate retries rejected | You enabled a short tolerance window. Community retries for up to an hour — widen or disable it |

To confirm your implementation independently, recompute the digest by hand
against a captured request:

```bash
# Given t=1711666033 and the exact raw body in body.json
printf '1711666033.%s' "$(cat body.json)" \
  | openssl dgst -sha256 -hmac "$COMMUNITY_WEBHOOK_SECRET"
```

The output should match the `v1=` value in the header.

## Related

- [overview.md](overview.md) - Event types, payload structure, delivery semantics
- [setup.md](setup.md) - Configure the webhook and get the signature secret
- [Community webhook documentation](https://developer.community.com/reference/webhooks-introduction)
