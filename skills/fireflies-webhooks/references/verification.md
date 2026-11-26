# Fireflies Signature Verification

This document covers **Webhooks V2** first — the current scheme, and what new
integrations receive. The [legacy V1 scheme](#legacy-webhooks-v1-verification)
follows at the end.

## How It Works (V2)

Fireflies V2 signs every webhook request using HMAC-SHA256 over the **raw
request body**, keyed with the signing secret you configured at webhook setup.
The digest is hex-encoded, prefixed with `sha256=`, and sent in the
`X-Hub-Signature` header:

```
X-Hub-Signature: sha256=<hex-encoded-signature>
```

The signature is computed as:

```
"sha256=" + HMAC-SHA256(raw_request_body, signing_secret) → hex encoded
```

The docs' verification steps are:

1. Extract the `X-Hub-Signature` header from the incoming request.
2. Compute the HMAC-SHA256 digest of the raw request body using your signing secret.
3. Prefix the hex-encoded digest with `sha256=`.
4. Compare the computed signature with the header value using a timing-safe comparison.

You can compare either the full prefixed strings (as Fireflies' own examples do)
or split the prefix off and compare the hex halves. Both are fine; the examples
in this skill split the prefix so the comparison operates on decoded bytes.

> **Confirmed: the raw body is what is signed.** The V2 docs state this
> explicitly, so no guessing is required. (The V1 docs did not — see the hedge in
> the legacy section.) Do not parse and re-serialize the JSON before computing
> the HMAC.

> **The signing secret is optional.** Fireflies makes the signing secret optional
> at webhook setup, and when it is unset **no `X-Hub-Signature` header is sent at
> all**. This was confirmed on a live test delivery: with no secret configured,
> the request carried no `x-hub-signature`. Your handler must decide what to do
> with an unsigned delivery — see [Handling unsigned deliveries](#handling-unsigned-deliveries).

> **No official SDK:** Fireflies does not publish a webhook SDK for Node.js or
> Python, so verification is implemented manually in every framework. The core
> is a standard HMAC-SHA256 hex digest, which the language standard libraries
> provide (`crypto` in Node, `hmac`/`hashlib` in Python).

> **Verified against a live delivery (July 2026).** A real V2 webhook carried
> `x-hub-signature: sha256=98d77ddf…` and recomputing `HMAC-SHA256(raw_body, secret)`
> reproduced the hex digest exactly — so the prefix, the hex encoding and the
> body-as-signed-content are confirmed, not inferred.
>
> One honest caveat: Fireflies sends **compact JSON**, so for that delivery the raw
> bytes and `JSON.stringify(parsed)` were byte-identical and both forms produced the
> same digest. That test therefore cannot distinguish the two. Use the raw body
> anyway — it is what the V2 docs specify, and it is the only approach that stays
> correct if Fireflies ever emits whitespace or reorders keys.
>
> Also confirmed live: with **no** signing secret configured, Fireflies sends no
> `x-hub-signature` header at all; setting one switches signing on for the same
> event type.

## Implementation (V2)

### Node.js

```javascript
const crypto = require('crypto');

function verifyFirefliesWebhook(rawBody, signatureHeader, secret) {
  // Fail closed: no header or no configured secret means we cannot verify
  if (!signatureHeader || !secret) {
    return false;
  }

  // V2 requires the `sha256=` prefix - reject anything else, including a bare
  // hex digest
  if (!signatureHeader.startsWith('sha256=')) {
    return false;
  }

  const receivedHex = signatureHeader.slice('sha256='.length);

  // Compute expected signature over the raw body (hex-encoded)
  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  // Timing-safe comparison; guard against length/format mismatch
  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHex, 'hex'),
      Buffer.from(expectedHex, 'hex')
    );
  } catch {
    return false;
  }
}

// Usage in Express (raw body required)
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    const signature = req.headers['x-hub-signature'];

    if (!verifyFirefliesWebhook(req.body, signature, process.env.FIREFLIES_WEBHOOK_SECRET)) {
      return res.status(401).send('Invalid signature');
    }

    // Process webhook...
  }
);
```

### Python

```python
import hmac
import hashlib

SIGNATURE_PREFIX = "sha256="


def verify_fireflies_webhook(raw_body: bytes, signature_header: str, secret: str) -> bool:
    # Fail closed: no header or no configured secret means we cannot verify
    if not signature_header or not secret:
        return False

    # V2 requires the "sha256=" prefix - reject anything else, including a bare
    # hex digest
    if not signature_header.startswith(SIGNATURE_PREFIX):
        return False

    # Compute expected signature over the raw body (hex-encoded, prefixed)
    expected_signature = SIGNATURE_PREFIX + hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    # Timing-safe comparison
    return hmac.compare_digest(signature_header, expected_signature)
```

## Handling Unsigned Deliveries

Because the signing secret is optional, "no signature header" is a genuine
Fireflies behaviour rather than only an attack signal. There are two defensible
policies — pick one deliberately and write it down:

**Strict (recommended for production):** configure a signing secret in Fireflies,
require the header, and reject anything unsigned with a 401. Any unsigned request
is then either a misconfiguration or an attacker.

**Permissive (what the examples in this skill do):** if `FIREFLIES_WEBHOOK_SECRET`
is unset locally, log a loud warning and accept the delivery, so an
unconfigured setup works end to end while you are getting started. As soon as a
secret *is* configured, every delivery must carry a valid signature or it is
rejected.

```javascript
const secret = process.env.FIREFLIES_WEBHOOK_SECRET;

if (!secret) {
  // Fireflies genuinely sends no signature when no secret is configured
  console.warn('FIREFLIES_WEBHOOK_SECRET is not set - accepting this delivery UNVERIFIED.');
} else if (!verifyFirefliesWebhook(rawBody, signature, secret)) {
  return res.status(401).send('Invalid signature');
}
```

What you should **not** do is silently accept unsigned deliveries with no signal,
or crash with a 500 when the secret is absent — the first hides a security hole,
the second makes an otherwise valid Fireflies configuration look broken.

## Common Gotchas (V2)

### 1. The `sha256=` Prefix Is Required

V2 sends `X-Hub-Signature: sha256=<hex>`. Feeding the whole header value into a
hex decoder produces garbage, so either strip the prefix before decoding or add
the prefix to your computed digest before comparing.

```javascript
// WRONG - the header value is not bare hex; this mangles the comparison
Buffer.from(signatureHeader, 'hex');

// CORRECT - strip the prefix first
const receivedHex = signatureHeader.slice('sha256='.length);
```

Reject a header that lacks the prefix rather than tolerating both formats.
Fireflies documents `sha256=<hex>` as the only format, so a bare digest is not
a Fireflies V2 signature.

### 2. Raw Body, Not Re-Serialized JSON

The V2 docs state the raw request body is signed. Parsing JSON first and
re-serializing can change the bytes — key order, whitespace, unicode escaping —
which breaks verification.

**Express:**

```javascript
// WRONG - body is already parsed and re-serialized; the bytes no longer match
app.use(express.json());
app.post('/webhooks/fireflies', (req, res) => {
  verifyFirefliesWebhook(JSON.stringify(req.body), ...);
});

// CORRECT - use the raw body
app.post('/webhooks/fireflies',
  express.raw({ type: 'application/json' }),
  (req, res) => {
    verifyFirefliesWebhook(req.body, ...);
  }
);
```

In Next.js App Router, read `await request.text()` and verify that string. In
FastAPI, use `await request.body()` to get the raw bytes.

### 3. Hex Encoding, Not Base64

The digest is hex-encoded:

```javascript
// WRONG - base64 encoding
.digest('base64')

// CORRECT - hex encoding
.digest('hex')
```

### 4. Timing-Safe Comparison

Always compare with a timing-safe function to avoid leaking information via
response timing:

```javascript
// WRONG - vulnerable to timing attacks
if (computedSignature === receivedSignature) { ... }

// CORRECT - timing-safe
crypto.timingSafeEqual(
  Buffer.from(receivedHex, 'hex'),
  Buffer.from(expectedHex, 'hex')
);
```

`timingSafeEqual` throws when the two buffers differ in length (e.g. a malformed
or non-hex header). Wrap it in `try/catch` and return `false` on error. Note
that Fireflies' own Node example compares UTF-8 buffers of the full prefixed
strings and length-checks first for the same reason.

### 5. Header Name Casing

HTTP headers are case-insensitive, and most frameworks lowercase them. The docs
write `X-Hub-Signature`, but read it lowercased:
`req.headers['x-hub-signature']`, `request.headers.get('x-hub-signature')`.

### 6. Timestamp Is Milliseconds

The `timestamp` field is a unix timestamp in **milliseconds**, not seconds. If
you use it for freshness checks, divide by 1000 or compare against
`Date.now()` directly. It is not part of the signed-string construction — the
signature covers the body only, so there is no replay-window scheme here.

## Debugging Verification Failures

### Check the Raw Body

```javascript
app.post('/webhooks/fireflies', express.raw({ type: 'application/json' }), (req, res) => {
  console.log('Body is Buffer:', Buffer.isBuffer(req.body));
  console.log('Signature header:', req.headers['x-hub-signature']);
});
```

### Compare Signatures

```javascript
const computed = 'sha256=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
console.log('Computed:', computed);
console.log('Received:', signature);
```

If the received value has no `sha256=` prefix, it doesn't match the documented
format — see the legacy section below if the body has `eventType` rather than
`event`.

### Check Your Secret

Make sure the secret matches exactly what you configured on the Fireflies
Webhooks V2 page. Watch out for:

- Leading/trailing whitespace
- Copy-paste errors
- No secret configured at all in Fireflies (in which case no header is sent —
  that is not a verification failure, it is an unsigned delivery)
- Using the API key instead of the webhook signing secret

## Legacy: Webhooks V1 Verification

V1 is deprecated and new V1 webhooks can no longer be saved, but existing V1
webhooks keep delivering. The `webhook` URL on the `uploadAudio` mutation also
still sends the V1 payload shape.

Fireflies' V2 migration table lists the **same signature header and format** for
V1 as for V2: `X-Hub-Signature` with `sha256=<hex>`. The V1 page itself only
says the header carries "a SHA-256 HMAC signature of the request payload" and
does not print the format. Earlier versions of this skill said V1 sent a bare
hex digest with no prefix. Current docs say otherwise, so the V1 verifier below
uses the V2 rule, and falls back to comparing a bare digest only if one arrives.

> **Unconfirmed in V1: raw bytes vs `JSON.stringify`.** The exact body form that
> goes into the HMAC is not stated in prose — the V1 docs point at an external
> Replit code sample. Keep the raw body as your default. If verification fails
> consistently with the right secret, log the raw body and try
> `JSON.stringify(JSON.parse(rawBody))` (Python:
> `json.dumps(json.loads(raw_body), separators=(",", ":"))`) as the HMAC input
> before concluding the secret is wrong. **This uncertainty is V1-only** — the V2
> docs state plainly that the raw body is signed.

### V1 Implementation

```javascript
const crypto = require('crypto');

function verifyFirefliesWebhookV1(rawBody, signatureHeader, secret) {
  // Fail closed: no header or no configured secret means we cannot verify
  if (!signatureHeader || !secret) {
    return false;
  }

  // Documented format is `sha256=<hex>`; accept a bare digest too
  const receivedHex = signatureHeader.startsWith('sha256=')
    ? signatureHeader.slice('sha256='.length)
    : signatureHeader;

  const expectedHex = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  try {
    return crypto.timingSafeEqual(
      Buffer.from(receivedHex, 'hex'),
      Buffer.from(expectedHex, 'hex')
    );
  } catch {
    return false;
  }
}
```

```python
import hmac
import hashlib


def verify_fireflies_webhook_v1(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not signature_header or not secret:
        return False

    # Documented format is "sha256=<hex>"; accept a bare digest too
    received = signature_header.removeprefix("sha256=")

    expected = hmac.new(
        secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    return hmac.compare_digest(received, expected)
```

### V1 Notes

**Secret.** An existing V1 webhook's secret can be viewed under **Settings →
Developer Settings → Webhook → View Configuration**, but no longer changed. When
you migrate, enter the same secret as the V2 **Signing Secret**.

**Tell the versions apart by the body.** V1 payloads carry `eventType` and
camelCase fields; V2 payloads carry `event` and snake_case fields.

Hex encoding, timing-safe comparison, and header-name casing work the same way
as in V2.

## Full Documentation

- [Fireflies Webhooks V2](https://docs.fireflies.ai/graphql-api/webhooks-v2) — current scheme
- [Fireflies Webhooks (V1)](https://docs.fireflies.ai/graphql-api/webhooks) — legacy scheme
