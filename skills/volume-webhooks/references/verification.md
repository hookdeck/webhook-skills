# How to Verify Volume Webhook Signatures

## How Does Volume Sign Webhooks?

Volume signs each webhook's **raw JSON body** with its RSA-2048 private key using
`SHA256withRSA` (RSA **PKCS#1 v1.5** padding, SHA-256 digest), and sends the
result in the `Authorization` header:

```
Authorization: SHA256withRSA hnHI6qoo7p37NwtBFj332TWC9UUHFiMl...fnw==
```

The header format is `{algorithm_used} {signature}`:

- **Scheme token:** `SHA256withRSA`. Reject anything else.
- **Signature:** standard base64 (`+` and `/`, `=` padding). Not base64url, not hex.

What's signed is the request body bytes exactly as sent. There is no timestamp,
no message ID, and no concatenated fields. It is also **not HMAC**: there's no
shared secret, so `createHmac` / `hmac.new` can never verify a Volume webhook.

You verify with Volume's public key for the right environment:

- Sandbox: `https://api.sandbox.volumepay.io/.well-known/signature/pem`
- Live: `https://api.volumepay.io/.well-known/signature/pem`

The response is a bare base64 SPKI key, with no PEM header or footer lines.

## Implementation

There is no Volume SDK for webhook verification. Volume's own Node reference
consumer
([getvolume/volume-webhook-node-consumer](https://github.com/getvolume/volume-webhook-node-consumer))
uses `crypto.createVerify('RSA-SHA256')`, so every example here verifies
manually with the platform crypto library.

### Node.js (`crypto`)

```javascript
const crypto = require('crypto');

// Option A: decode base64 -> DER, load as SPKI
const key = crypto.createPublicKey({
  key: Buffer.from(pemBody.trim(), 'base64'), format: 'der', type: 'spki',
});
// Option B (Volume's sample): wrap it in PEM armour
// const key = `-----BEGIN PUBLIC KEY-----\n${pemBody.trim()}\n-----END PUBLIC KEY-----`;

const [scheme, signature] = authorization.trim().split(/\s+/);
const ok =
  scheme === 'SHA256withRSA' &&
  crypto.verify('sha256', rawBody, key, Buffer.from(signature, 'base64'));
// PKCS#1 v1.5 is the default padding for RSA keys. Do NOT pass RSA_PKCS1_PSS_PADDING.
```

### Python (`cryptography`)

```python
import base64
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import padding

key = serialization.load_der_public_key(base64.b64decode(pem_body.strip()))

scheme, _, signature = authorization.strip().partition(" ")
try:
    if scheme != "SHA256withRSA":
        raise InvalidSignature()
    key.verify(base64.b64decode(signature, validate=True), raw_body,
               padding.PKCS1v15(), hashes.SHA256())
    valid = True
except (InvalidSignature, ValueError):
    valid = False
```

### Key handling

- **Cache the key** for about an hour rather than fetching it on every request.
  The examples cache it.
- **Fail closed.** If the key can't be fetched or parsed, reject the webhook. A
  `503` makes Volume retry later. Never skip verification.
- **Allow an override.** The examples accept `VOLUME_PUBLIC_KEY` (literal key)
  and `VOLUME_PEM_URL` / `VOLUME_ENV` so tests never touch the network.

## Common Gotchas

- **Re-serialised body.** Volume's docs warn that anything that changes the
  payload before verification breaks it, including automatic deserialisation
  into DTOs (enum mapping, number formatting, key order, whitespace). Use
  `express.raw()`, `request.arrayBuffer()` or `await request.body()`, verify,
  *then* parse. Volume's Node sample parses with `bodyParser.json` but verifies
  the saved raw string, not `JSON.stringify(req.body)`.
- **PSS instead of PKCS#1 v1.5.** "RSA + SHA-256" is ambiguous. Volume uses
  PKCS#1 v1.5 (Java `SHA256withRSA`). PSS rejects every real delivery.
- **HMAC.** There's no secret. An HMAC implementation can never verify.
- **Passing the whole header as the signature.** Strip the `SHA256withRSA `
  prefix. Only the part after the space is base64.
- **Wrong environment key.** Sandbox and live keys differ. A sandbox test call
  fails against the live key, which is correct.
- **Bare key text.** The URL returns base64 without PEM lines. Passing it
  straight to `createPublicKey(string)` or `load_pem_public_key` fails. Either
  wrap it or decode it as DER.
- **`POST`-only routes.** Volume sends `PUT`. A `POST`-only route returns
  `404`/`405` and Volume keeps retrying.

## Debugging Verification Failures

| Symptom | Likely cause |
|---|---|
| Every webhook fails, including Volume's docs `curl` calls | Wrong key environment, PSS padding, HMAC, or the whole header passed as the signature |
| Docs `curl` calls pass, real webhooks fail | Body parsed and re-serialised before verifying (framework JSON middleware) |
| `503` from the examples | Key URL unreachable or returned something other than a base64 key |
| `404`/`405` in Volume's delivery logs | Route only handles `POST`. Add `PUT` |
| Intermittent failures after a deploy | A proxy or middleware is rewriting the body (compression, charset, pretty-printing) |

**Quick check:** Volume's docs publish two sandbox-signed calls. The
`COMPLETED` one is:

```
body: {"paymentId":"3f2a2b69-6d42-4050-9c4f-7e8849bf683c","merchantPaymentId":"806","paymentStatus":"COMPLETED","errorDescription":null,"paymentRequest":{"amount":24.23,"currency":"GBP","reference":"payment-reference"},"paymentRefundData":null,"paymentMetadata":{"some-data":"some-value"}}
Authorization: SHA256withRSA hnHI6qoo7p37NwtBFj332TWC9UUHFiMlwgKsI2XV+L1xKbIK4Vp+3b3bczrdM+8bLXNTRMvJJJ+5zr5uBXBhl9enN3Sfq/4q3gmdq1pGd0Gz0YaRUZxhNG2tkVq7LGtKeeWzg5PxfCy7PeD3D71C+SnUYa7fwT+KzKyPCMqk+uWjLws6pKysinOzh3aYmVhaW9DhH6gZtV2LLGQFHUsqtYClzOkQRxDePhJU8kf8tu8FyTYxJgN4+CZ7vXrD162L0zrcsHXZX1VvVS0GbguHz/JHIFRzqu+o3QpHoidnU+reXPoCQOBV420NaWwVy3Op5o3rFSAZvSwjwAczoQRfnw==
```

It verifies against the **sandbox** key and must fail against the live key. If
your verifier rejects it with the sandbox key, the bug is in your verifier.
Every example's test suite runs this check.

## Defence in Depth

Volume also publishes static source IPs (see [setup.md](setup.md)). An IP
allowlist supplements signature verification and never replaces it.
