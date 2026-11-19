# Gusto Signature Verification

## The Scheme

| Part | Value |
|---|---|
| Header | `X-Gusto-Signature` |
| Algorithm | HMAC-SHA256 |
| Encoding | Hex, no prefix (Gusto's developer doc; the current guide doesn't say) |
| Key | The subscription's `verification_token`, used as UTF-8 text |
| Signed content | The raw request body |
| Timestamp | None in the signature (the body has a `timestamp`) |

The current [Gusto guide](https://docs.gusto.com/embedded-payroll/docs/webhooks): "Gusto computes a hash message authentication code (HMAC) of the event payload using the `verification_token` … as the secret, and SHA256 as the hash function." It doesn't say how the result is encoded.

Gusto's own developer doc ([gusto.github.io, `v1/webhooks/about`](https://github.com/Gusto/gusto.github.io/blob/master/_posts/2018-11-16-webhooks-about.markdown)) fills that in: "The signature value is a hex digest of the hash-based message authentication code", with a 64-character example header and this Rails sample:

```ruby
computed = OpenSSL::HMAC.hexdigest(OpenSSL::Digest::SHA256.new, GUSTO_VERIFICATION_TOKEN, request.raw_post)
actual = request.headers['X-Gusto-Signature']
```

That doc dates from the 2018 closed beta. Same header, algorithm and key name, but if a live event doesn't verify, check the header's shape: 64 hex characters is hex, 44 characters ending in `=` would be base64.

## Node.js

```javascript
const crypto = require('crypto');

function verifyGustoSignature(rawBody, signature, token) {
  const secret = String(token || '').trim();
  const value = String(signature || '').trim();
  if (!secret || !/^[0-9a-fA-F]{64}$/.test(value)) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest();
  return crypto.timingSafeEqual(Buffer.from(value, 'hex'), expected);
}
```

## Python

```python
import hashlib, hmac, re

def verify_gusto_signature(raw_body: bytes, signature: str, token: str) -> bool:
    value = (signature or "").strip()
    if not token or not re.fullmatch(r"[0-9a-fA-F]{64}", value):
        return False
    expected = hmac.new(token.strip().encode("utf-8"), raw_body, hashlib.sha256).digest()
    return hmac.compare_digest(bytes.fromhex(value), expected)
```

## The Token Request

Gusto doesn't document whether the request carrying the `verification_token` is signed, and you can't check it before you have the token. The examples:

- treat a JSON body with a string `verification_token` and **no** `event_type` as the handshake
- answer it `200` without a signature check, and take no action on it
- print the token only while `GUSTO_VERIFICATION_TOKEN` is unset
- require a valid signature on everything else, including bodies that have both fields

A forged handshake changes nothing: the example takes no action on it, and the printed token only matters if you send it to `PUT .../verify`, which is where a wrong token would show up.

## Debugging Mismatches

| Symptom | Cause |
|---|---|
| Subscription stays `pending` | You haven't called `PUT .../verify` with the token |
| Every event fails | `GUSTO_VERIFICATION_TOKEN` is from another subscription. Each subscription has its own token |
| Every event fails, right token | The body was parsed and re-serialised. HMAC the raw bytes |
| Header is 44 characters ending in `=` | Base64, not hex. Compare against `digest('base64')` instead |
| No events at all | The subscription doesn't include that entity type, or the company hasn't connected your app |
