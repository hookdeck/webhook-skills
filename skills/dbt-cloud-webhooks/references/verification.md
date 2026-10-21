# dbt Cloud Signature Verification

## How Does dbt Cloud Sign Webhooks?

dbt sends the signature in the **`Authorization`** header. Per the dbt docs, it "contains a SHA256 hash of the request body and uses the secret token as a key":

- Algorithm: HMAC-SHA256
- Signed content: the raw request body (no timestamp, no event id)
- Key: the webhook secret (`hmac_secret`), used as a raw UTF-8 string
- Encoding: lowercase hex digest
- Header value: the bare digest. No `Bearer`, no `sha256=` prefix.

dbt's own Python example:

```python
auth_header = request.headers.get('authorization', None)
app_secret = os.environ['MY_DBT_CLOUD_AUTH_TOKEN'].encode('utf-8')
signature = hmac.new(app_secret, request_body, hashlib.sha256).hexdigest()
return signature == auth_header
```

## Implementation

dbt has no official verification SDK, so verify manually.

### Node.js

```javascript
const crypto = require('crypto');

function verifyDbtCloudSignature(rawBody, authHeader, secret) {
  if (!authHeader) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(authHeader.trim());
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python

```python
import hashlib, hmac

def verify_dbt_cloud_signature(raw_body: bytes, auth_header: str | None, secret: str) -> bool:
    if not auth_header:
        return False
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(auth_header.strip().encode(), expected.encode())
```

## Common Gotchas

- **Raw body.** Hash the bytes as received. Parsing and re-serializing JSON changes whitespace and key order and breaks the hash. In Express use `express.raw({ type: '*/*' })`.
- **No scheme prefix.** Don't strip `Bearer` or `sha256=`; there isn't one.
- **Secret is a raw string.** Don't base64- or hex-decode it.
- **No timestamp.** There is nothing to check for freshness. Dedupe on `eventId` instead.
- **Duplicate events.** `job.run.errored` is a subset of `job.run.completed`; subscribing to both delivers two notifications for a failed run.
- **10-second timeout.** Acknowledge fast and process asynchronously.
- **Authorization-hostile destinations.** Azure Logic Apps and Power Automate may drop the header.

## Debugging Verification Failures

1. Log the length of the header: it should be 64 characters (hex SHA-256).
2. Confirm you're using the secret of *this* webhook (each webhook has its own).
3. Confirm no middleware parsed or modified the body before verification.
4. Recompute with the sample body: `printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
5. Check the Recent Deliveries log in dbt for the status your endpoint returned.
