# How to Verify AWS SNS Message Signatures

## Why Signature Verification Matters

SNS HTTP/S endpoints are public URLs with **no shared secret**. Anyone who
learns your URL can POST a validly *shaped* JSON envelope. Signature
verification is what proves a message genuinely came from AWS SNS and was not
tampered with in transit. **Always verify before acting on a message.**

## How It Works

1. SNS signs a **canonical string** built from specific envelope fields with its
   **RSA private key**.
2. The message includes `Signature` (base64), `SignatureVersion` (`1` = SHA1,
   `2` = SHA256), and `SigningCertURL` — the HTTPS URL of the matching public
   X.509 certificate.
3. You fetch the certificate, extract its public key, rebuild the same canonical
   string from the message fields, and RSA-verify the decoded signature.

Note: SNS signs **specific fields**, not the raw request body. So (unlike HMAC
providers) you parse the JSON first, then verify the reconstructed field string.
Still avoid mutating field values before verifying.

### The Canonical String

Fields are included in **byte-sorted (alphabetical) key order**, formatted as
`Key\nValue\n` for each field (a trailing newline after every pair). Include a
field **only if it is present** in the message, and include no extras:

- **`Notification`:** `Message`, `MessageId`, `Subject` *(if present)*,
  `Timestamp`, `TopicArn`, `Type`
- **`SubscriptionConfirmation`:** `Message`, `MessageId`, `SubscribeURL`,
  `Timestamp`, `Token`, `TopicArn`, `Type`
- **`UnsubscribeConfirmation`:** `Message`, `MessageId`, `SubscribeURL`,
  `Timestamp`, `Token`, `TopicArn`, `Type` (the same set as a
  `SubscriptionConfirmation`)

> **Note on `UnsubscribeConfirmation`:** AWS's signature page groups the two
> confirmation types together, and the AWS-official
> [`sns-validator`](https://www.npmjs.com/package/sns-validator) signs `Token`
> for both from version 0.3.6 (November 2026). Versions up to 0.3.5 left
> `Token` out for `UnsubscribeConfirmation`, so pin `^0.3.6`.

Example canonical string for a Notification (each field on its own line):

```
Message
Hello world!
MessageId
22b80b92-fdea-4c2c-8f9d-bdfb0c7bf324
Subject
My subject
Timestamp
2012-05-02T00:54:06.655Z
TopicArn
arn:aws:sns:us-east-1:123456789012:MyTopic
Type
Notification
```

### Validate `SigningCertURL` Before Fetching It

`SigningCertURL` is attacker-influenceable data. Before downloading, confirm it
is an **HTTPS** URL whose host matches `sns.<region>.amazonaws.com` (AWS uses the
pattern `^sns\.[a-zA-Z0-9\-]{3,}\.amazonaws\.com(\.cn)?$`). Rejecting other hosts
prevents an attacker from pointing you at a certificate they control.

## Implementation

### SDK Verification — Node.js (preferred)

The AWS-official [`sns-validator`](https://www.npmjs.com/package/sns-validator)
package handles everything: canonical string, SigV1/SigV2 selection, the cert
host allowlist, cert fetch + cache, and RSA verification.

```javascript
const MessageValidator = require('sns-validator');
const validator = new MessageValidator(); // enforces sns.<region>.amazonaws.com over HTTPS

const message = JSON.parse(rawBody); // parse first — SNS signs fields, not the raw body
validator.validate(message, (err, msg) => {
  if (err) {
    // Invalid signature, bad cert URL, or malformed message
    return; // reject with 400
  }
  // msg is authentic — safe to process
});
```

`sns-validator` **0.3.5+** (Aug 2022) supports both SignatureVersion 1 and 2
(0.3.4 and earlier reject SignatureVersion 2). **0.3.6** (Nov 2026) adds `Token`
to the `UnsubscribeConfirmation` string to sign, so pin `^0.3.6`.

### Manual Verification — Python (fallback)

There is no AWS webhook-verification SDK for Python, so verify manually with the
`cryptography` library. Build the canonical string, fetch and host-check the
certificate, then RSA-verify.

```python
import base64, re
from urllib.parse import urlparse
import httpx
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding
from cryptography.exceptions import InvalidSignature

_CERT_HOST = re.compile(r"^sns\.[a-zA-Z0-9\-]{3,}\.amazonaws\.com(\.cn)?$")

# Fixed key order per type; include a key only if present in the message.
# Both confirmation types sign SubscribeURL and Token; a Notification signs Subject if present.
_NOTIFICATION_KEYS = ["Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"]
_CONFIRMATION_KEYS = ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"]

def canonical_string(msg: dict) -> bytes:
    keys = _NOTIFICATION_KEYS if msg.get("Type") == "Notification" else _CONFIRMATION_KEYS
    parts = []
    for field in keys:
        if field not in msg or msg[field] is None:
            continue  # Subject is included only when present
        parts.append(field)
        parts.append(str(msg[field]))
    return ("\n".join(parts) + "\n").encode("utf-8")

def verify(msg: dict) -> bool:
    url = msg["SigningCertURL"]
    parsed = urlparse(url)
    if parsed.scheme != "https" or not _CERT_HOST.match(parsed.hostname or ""):
        return False  # untrusted certificate host

    cert_pem = httpx.get(url, timeout=5).content
    public_key = x509.load_pem_x509_certificate(cert_pem).public_key()
    algorithm = hashes.SHA256() if msg.get("SignatureVersion") == "2" else hashes.SHA1()

    try:
        public_key.verify(
            base64.b64decode(msg["Signature"]),
            canonical_string(msg),
            padding.PKCS1v15(),
            algorithm,
        )
        return True
    except InvalidSignature:
        return False
```

## Common Gotchas

- **Parse first, then verify.** SNS signs canonical fields, not the raw body.
  But do not alter field values (e.g. re-encoding) before rebuilding the string —
  a JSON parser that un-escapes `\n` in `Message`/`Subject` is required so the
  values match what SNS signed.
- **Field order and set are fixed.** Byte-sorted order, only the allowed fields,
  `Subject` included **only if present**, and a trailing `\n` after every pair.
- **Pick the hash from `SignatureVersion`.** `1` → SHA1, `2` → SHA256. Support
  both; a topic can be switched to SigV2 at any time.
- **Host-check `SigningCertURL`.** Must be HTTPS and `sns.<region>.amazonaws.com`.
  Never fetch an arbitrary URL from the message.
- **Raw message delivery has no signature.** With `RawMessageDelivery=true`
  there is no envelope and nothing to verify — keep raw delivery off if you rely
  on signatures. See [overview.md](overview.md).
- **Confirm the subscription.** A `SubscriptionConfirmation` must be verified
  *and* confirmed (GET `SubscribeURL`) or no notifications ever arrive.

## Debugging Verification Failures

| Symptom | Likely cause |
|---------|--------------|
| "signature is invalid" on every message | Wrong field order, extra/missing field, or a trailing/missing `\n` in the canonical string |
| Fails only when a `Subject` is set | `Subject` omitted from (or wrongly always added to) the canonical string |
| Fails after switching topic to SigV2 | Hard-coded SHA1; select the hash from `SignatureVersion` |
| Cert fetch rejected / error | `SigningCertURL` failed the `sns.<region>.amazonaws.com` HTTPS host check |
| Values differ subtly | Message body not JSON-parsed (escaped `\n` not converted) before building the string |
