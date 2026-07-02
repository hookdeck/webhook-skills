# How to Verify Adyen Webhook Signatures

## Why Signature Verification Matters

Anyone who knows your webhook URL could POST fake payment events. Adyen signs every
`NotificationRequestItem` with an **HMAC-SHA256 signature** so you can confirm the
event genuinely came from Adyen and was not tampered with. **Never act on an Adyen
webhook before verifying its HMAC signature.**

## How Adyen's HMAC Scheme Works

Unlike many providers (Stripe, Shopify, GitHub), **Adyen does NOT sign the raw
request body.** Instead, it signs a string built from **specific fields** of the
`NotificationRequestItem`. This means you **parse the JSON first**, then rebuild and
verify the signed string per item.

### The signing string

Concatenate these fields, in this **exact order**, joined with a colon (`:`):

```
pspReference : originalReference : merchantAccountCode : merchantReference : amount.value : amount.currency : eventCode : success
```

Rules:

- **Empty / missing fields become an empty string** (e.g. an original
  `AUTHORISATION` has no `originalReference`, so it renders as two adjacent colons).
- **Escape each value** before joining: replace `\` with `\\`, then `:` with `\:`.
  This prevents a colon inside a value from being mistaken for a delimiter.
- `amount.value` is the integer minor-units value; `amount.currency` is the ISO
  code.

Example signing string (note the empty `originalReference` → `::`):

```
7914073381342284::TestMerchant:TestPayment-1407325143704:1130:EUR:AUTHORISATION:true
```

### Computing the signature

1. **Hex-decode** the HMAC key from the Customer Area (it is a hex string) into raw
   bytes.
2. Compute **HMAC-SHA256** of the signing string (UTF-8 bytes) using the decoded
   key.
3. **Base64-encode** the digest.
4. Compare (timing-safe) against `additionalData.hmacSignature` on the item.

## Implementation

### SDK Verification (Node.js — preferred)

The official [`@adyen/api-library`](https://www.npmjs.com/package/@adyen/api-library)
does everything above, including reading `additionalData.hmacSignature` and the
timing-safe comparison:

```javascript
const { hmacValidator } = require('@adyen/api-library');

const validator = new hmacValidator();

// item is notificationItems[i].NotificationRequestItem (a plain parsed object)
const valid = validator.validateHMAC(item, process.env.ADYEN_HMAC_KEY);
```

To generate a signature (useful in tests):

```javascript
const signature = validator.calculateHmac(item, process.env.ADYEN_HMAC_KEY);
```

### Manual Verification (fallback — e.g. Python / FastAPI)

When you can't use the Node SDK, reproduce the algorithm exactly:

```python
import hmac, hashlib, base64, binascii

def calculate_hmac(item: dict, hex_key: str) -> str:
    amount = item.get("amount") or {}
    fields = [
        item.get("pspReference", ""),
        item.get("originalReference", ""),
        item.get("merchantAccountCode", ""),
        item.get("merchantReference", ""),
        amount.get("value", ""),
        amount.get("currency", ""),
        item.get("eventCode", ""),
        item.get("success", ""),
    ]
    # Escape backslash then colon in each value, then join with ':'
    data = ":".join(
        str(f).replace("\\", "\\\\").replace(":", "\\:") for f in fields
    )
    key = binascii.unhexlify(hex_key)  # hex string -> raw bytes
    digest = hmac.new(key, data.encode("utf-8"), hashlib.sha256).digest()
    return base64.b64encode(digest).decode("utf-8")


def is_valid_hmac(item: dict, hex_key: str) -> bool:
    expected = calculate_hmac(item, hex_key)
    received = (item.get("additionalData") or {}).get("hmacSignature", "")
    return hmac.compare_digest(expected, received)  # timing-safe
```

## Verify Every Item in the Batch

`notificationItems` is an array. Verify **each** item independently and reject the
request if **any** signature is invalid:

```javascript
for (const { NotificationRequestItem: item } of body.notificationItems) {
  if (!validator.validateHMAC(item, process.env.ADYEN_HMAC_KEY)) {
    return res.status(401).send('Invalid HMAC signature');
  }
}
```

## Common Gotchas

- **Don't sign the raw body.** Adyen signs reconstructed fields, not the HTTP body.
  Parsing the JSON before verification is correct and expected here.
- **Hex-decode the key.** The Customer Area key is a hex string; using it as-is
  (UTF-8 bytes) produces a wrong signature. Decode hex → bytes first.
- **Escape values.** Forgetting to escape `\` and `:` breaks signatures whenever a
  field value contains a colon (e.g. some `reason` values). The signed fields
  rarely contain colons, but always escape to match Adyen.
- **Empty fields are empty strings, not omitted.** `originalReference` is empty on
  original authorisations — keep the delimiter (`::`).
- **`success` and `amount.value` are compared as strings.** The SDK/JSON gives
  `success` as `"true"`/`"false"` and `value` as a number; both are stringified in
  the signing string.
- **Per-environment keys.** Test and live have different HMAC keys. A key mismatch
  is the most common cause of failures.
- **Basic Auth is separate.** HMAC proves authenticity; Basic Auth restricts
  access. Configure both (see [setup.md](setup.md)).

## Debugging Verification Failures

1. **Log the computed vs received signature.** If they differ, the signing string
   or key is wrong.
2. **Print the signing string.** Confirm field order, `::` for empty fields, and
   that `amount.value`/`amount.currency` are present.
3. **Confirm the key is hex-decoded**, not used verbatim.
4. **Check the environment.** Are you validating a live webhook with a test key (or
   vice versa)?
5. **Confirm you're validating `NotificationRequestItem`**, not the whole
   `notificationItems[i]` wrapper.
