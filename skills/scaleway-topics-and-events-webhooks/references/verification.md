# Scaleway Topics and Events Signature Verification

## How It Works

Each envelope carries:

| Field | Value |
|-------|-------|
| `SignatureVersion` | Always `"1"`: RSA PKCS#1 v1.5 with SHA-1. Scaleway: "Version 1 is always used, version 2 is not supported." |
| `Signature` | Base64 signature over the canonical string below |
| `SigningCertURL` | HTTPS URL of the signing certificate, e.g. `https://messaging.s3.fr-par.scw.cloud/fr-par/sns/sns_certificate_<serial>.crt` |

Scaleway's rules ([Verifying webhook signatures](https://www.scaleway.com/en/docs/topics-and-events/reference-content/verifying-webhooks/)):

- "Your application should **not** directly trust the certificate pointed to by `SigningCertURL`. Instead, you must validate that this certificate was issued by our trusted Certificate Authority (CA), using the CA trust chain."
- For each message: "Check if the SigningCertURL has changed. If so, download the new certificate. Verify that the certificate is signed by the trusted CA (using the `.pem` file above). Only then use it to verify the message signature."
- "we recommend that you cache the certificate locally. You can use the unique ID in the `SigningCertURL` as a cache key."
- "The signing certificate used for webhook messages is rotated at least once per year." During a rollover "you may receive messages signed by both old and new certificates … Your system must accept messages signed by any currently valid certificate (i.e., those issued by the trusted CA)."

For the signature itself Scaleway points to AWS's SNS documentation, so the canonical string is SNS SignatureVersion 1's.

## Canonical String

Concatenate `Key\nValue\n` for each field below, in this order (byte order of the names). Skip `Subject` when it's absent or `null`; every other field must be present and a string. Look the field list up with an own-property check (`Object.hasOwn` or a `Map`) so a `Type` such as `constructor` or `__proto__` is rejected instead of reaching `Object.prototype`.

| `Type` | Fields |
|--------|--------|
| `Notification` | `Message`, `MessageId`, `Subject`, `Timestamp`, `TopicArn`, `Type` |
| `SubscriptionConfirmation`, `UnsubscribeConfirmation` | `Message`, `MessageId`, `SubscribeURL`, `Timestamp`, `Token`, `TopicArn`, `Type` |

Use the values exactly as they appear in the parsed JSON (UTF-8). `UnsubscribeURL`, `MessageAttributes` and `SigningCertURL` aren't signed.

## Certificate Checks

1. **URL.** `SigningCertURL` must be `https`, with no credentials, no port other than 443, and no query string or fragment, on an allowed host. The only https `SigningCertURL` in Scaleway's docs is fr-par's, on `messaging.s3.fr-par.scw.cloud`, so that's the default. (Two other doc samples show `http://<REDACTED-URL>/SNStest.crt`; the examples reject http.) This blocks requests to arbitrary hosts (SSRF) before anything is downloaded, and rejecting `?`/`#` keeps one certificate from being cached under endless URL variants. Scaleway doesn't promise the host will never change; `SCALEWAY_SNS_CERT_HOSTS` overrides it.
2. **Download.** No redirects, a short timeout, a size limit. A 4xx (or any non-200 below 500) means there's no such certificate: reject the message with 401, so a sender doesn't retry junk. A network error or 5xx is transient: answer 503. Cache only certificates that pass the chain check, keyed by URL (the examples also cap the cache at 50 entries).
3. **Chain.** Walk from the signing certificate to an issuer in the trust-chain bundle, then on to a self-signed root that is also in the bundle. At each step check that the issuer is a CA (`basicConstraints CA:TRUE`), that names match and the signature verifies, and that the certificate is within its validity window. Scaleway's bundle has a root (`Scaleway MnQ Root`, to June 2032) and an intermediate (`Scaleway MnQ`, to 5 December 2027).
4. **Key.** The signing certificate must have an RSA key.

Then verify `Signature` with RSA-SHA1 over the canonical string.

### Node.js

```javascript
const crypto = require('crypto');

function issuedBy(cert, issuer) {
  try { return issuer.ca && cert.checkIssued(issuer) && cert.verify(issuer.publicKey); } catch { return false; }
}

function chainsToTrustedRoot(leaf, bundle, now = Date.now()) {
  let cert = leaf;
  for (let depth = 0; depth < 5; depth++) {
    if (!(Date.parse(cert.validFrom) <= now && now <= Date.parse(cert.validTo))) return false;
    if (bundle.some((t) => t.fingerprint256 === cert.fingerprint256) && issuedBy(cert, cert)) return true;
    const issuer = bundle.find((t) => t.fingerprint256 !== cert.fingerprint256 && issuedBy(cert, t));
    if (!issuer) return false;
    cert = issuer;
  }
  return false;
}

// bundle: every certificate in sns-trust-chain.pem, as crypto.X509Certificate
// leaf: new crypto.X509Certificate(pemDownloadedFromSigningCertURL)
const ok = chainsToTrustedRoot(leaf, bundle) &&
  crypto.verify('RSA-SHA1', Buffer.from(canonical, 'utf8'), leaf.publicKey, Buffer.from(msg.Signature, 'base64'));
```

### Python

```python
from cryptography import x509
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import padding

def issued_by(cert, issuer) -> bool:
    try:
        if not issuer.extensions.get_extension_for_class(x509.BasicConstraints).value.ca:
            return False
        cert.verify_directly_issued_by(issuer)
        return True
    except (x509.ExtensionNotFound, ValueError, TypeError, InvalidSignature):
        return False

def chains_to_trusted_root(leaf, bundle, now: float) -> bool:
    cert = leaf
    for _ in range(5):
        if not (cert.not_valid_before_utc.timestamp() <= now <= cert.not_valid_after_utc.timestamp()):
            return False
        if cert in bundle and issued_by(cert, cert):
            return True
        cert = next((t for t in bundle if t != cert and issued_by(cert, t)), None)
        if cert is None:
            return False
    return False

# bundle = x509.load_pem_x509_certificates(open(path, "rb").read())
leaf.public_key().verify(signature_bytes, canonical.encode(), padding.PKCS1v15(), hashes.SHA1())
```

`verify_directly_issued_by` needs `cryptography` 40 or later, and `not_valid_before_utc` 42 or later.

## Subscription Confirmation URL

Before GETting `SubscribeURL`, check it the way Hookdeck does:

- `TopicArn` matches `arn:scw:sns:(fr-par|nl-ams):<project>:<topic>`
- `SubscribeURL` is `https`, host `sns.mnq.<that region>.scaleway.com`, path `/`, no credentials, port or fragment
- its query has exactly one `Action` (`ConfirmSubscription`), one `TopicArn` (equal to the message's) and one `Token` (equal to the message's, non-empty)

GET it unchanged, without following redirects. Success is HTTP 200.

## Common Gotchas

1. **Using AWS tooling as-is.** `sns-validator` accepts only certificates from `sns.<region>.amazonaws.com` by default, so it rejects Scaleway messages; pointing its host pattern at Scaleway still skips the trust-chain check Scaleway requires. Check the certificate against Scaleway's trust chain instead.
2. **Trusting `SigningCertURL` without the chain check.** Anyone can host a certificate and sign with its key.
3. **Trusting the topic.** A valid signature doesn't mean your topic: pin `TopicArn`.
4. **Routing on the `x-amz-sns-message-type` header.** It isn't signed; route on the body `Type` after verifying.
5. **Rejecting old `Timestamp`s by default.** Hookdeck retries and replays resend the original envelope, so a fixed window rejects them. The window is opt-in (`SCALEWAY_SNS_MAX_AGE_SECONDS`).
6. **Stale trust chain.** The bundled intermediate expires on 5 December 2027; download the file again before then.

## Debugging Verification Failures

1. Log the failure reason (the examples return one: bad `SignatureVersion`, missing field, disallowed `SigningCertURL`, certificate doesn't chain, signature mismatch).
2. "Does not chain": download the certificate and inspect it with `openssl x509 -in cert.crt -noout -subject -issuer -dates`, and compare its issuer with the subjects in `sns-trust-chain.pem`.
3. "Signature mismatch": print the canonical string and check the field set for the message `Type` and that `Subject` is included only when present.
4. Behind Hookdeck, open the request in Hookdeck's dashboard to see the exact envelope Scaleway sent; Hookdeck forwards it unchanged.
