# How to Verify Paymob Webhook Signatures

## Why Signature Verification Matters

Your callback endpoint is public. Without verification, anyone could POST a fake
"payment succeeded" body and trick you into fulfilling an order. Paymob signs
every callback with an HMAC so you can prove it came from Paymob and was not
tampered with.

## How Paymob's HMAC Scheme Works

Paymob is **not** Standard Webhooks, and it does **not** sign the raw request
body. Instead:

1. It picks a **fixed list of keys** for the callback's `type`.
2. It joins their **values in that order**, with **no separators**.
3. It computes **HMAC-SHA512** of that string using your account **HMAC secret**.
4. It **hex-encodes** the digest and sends it as the **`hmac` query parameter**
   (`?hmac=<hex>`). There is **no signature header**.

You recompute the same value and compare (timing-safe) against the `hmac` param.

### `TRANSACTION`: 20 keys, in order

| # | POST key (Transaction Processed) | GET (Transaction Response) |
|---|----------------------------------|--------------------------------|
| 1 | `obj.amount_cents` | `amount_cents` |
| 2 | `obj.created_at` | `created_at` |
| 3 | `obj.currency` | `currency` |
| 4 | `obj.error_occured` | `error_occured` |
| 5 | `obj.has_parent_transaction` | `has_parent_transaction` |
| 6 | `obj.id` | `id` |
| 7 | `obj.integration_id` | `integration_id` |
| 8 | `obj.is_3d_secure` | `is_3d_secure` |
| 9 | `obj.is_auth` | `is_auth` |
| 10 | `obj.is_capture` | `is_capture` |
| 11 | `obj.is_refunded` | `is_refunded` |
| 12 | `obj.is_standalone_payment` | `is_standalone_payment` |
| 13 | `obj.is_voided` | `is_voided` |
| 14 | `obj.order.id` | `order_id` per the key list; `order` in Paymob's sample URL |
| 15 | `obj.owner` | `owner` |
| 16 | `obj.pending` | `pending` |
| 17 | `obj.source_data.pan` | `source_data.pan` |
| 18 | `obj.source_data.sub_type` | `source_data.sub_type` |
| 19 | `obj.source_data.type` | `source_data.type` |
| 20 | `obj.success` | `success` |

The GET column follows Paymob's sample redirect URL, which flattens nested keys
with a dot (`source_data.pan=2346`) and carries the order as `order=`. Paymob's
key list names `order_id` for the GET callback, so check what your redirect
actually receives.

### `TOKEN`: 8 keys, in order

`obj.card_subtype`, `obj.created_at`, `obj.email`, `obj.id`, `obj.masked_pan`,
`obj.merchant_id`, `obj.order_id`, `obj.token`.

A card token callback arrives at the same URL as transaction callbacks, so
route on `type` before you build the string.

## Implementation

Paymob publishes worked examples rather than an SDK verifier, so verify with
the standard crypto library.

### Node.js (POST callbacks)

```javascript
const crypto = require('crypto');

const HMAC_FIELDS = {
  TRANSACTION: [
    'amount_cents', 'created_at', 'currency', 'error_occured', 'has_parent_transaction',
    'id', 'integration_id', 'is_3d_secure', 'is_auth', 'is_capture', 'is_refunded',
    'is_standalone_payment', 'is_voided', 'order.id', 'owner', 'pending',
    'source_data.pan', 'source_data.sub_type', 'source_data.type', 'success',
  ],
  TOKEN: [
    'card_subtype', 'created_at', 'email', 'id', 'masked_pan', 'merchant_id',
    'order_id', 'token',
  ],
};

function verifyPaymobHmac(body, hmacParam, secret) {
  const fields = HMAC_FIELDS[body.type];
  if (!fields || !body.obj || !hmacParam) return false;
  const signed = fields.map((f) => {
    const v = f.split('.').reduce((o, k) => (o == null ? undefined : o[k]), body.obj);
    return v == null ? '' : String(v);
  }).join('');
  const expected = crypto.createHmac('sha512', secret).update(signed).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(String(hmacParam).toLowerCase());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

### Python (POST callbacks)

```python
import hmac, hashlib

HMAC_FIELDS = {
    "TRANSACTION": [
        "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
        "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
        "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
        "source_data.pan", "source_data.sub_type", "source_data.type", "success",
    ],
    "TOKEN": [
        "card_subtype", "created_at", "email", "id", "masked_pan", "merchant_id",
        "order_id", "token",
    ],
}

def _value(obj, path):
    for key in path.split("."):
        obj = obj.get(key) if isinstance(obj, dict) else None
    if obj is True:
        return "true"
    if obj is False:
        return "false"
    return "" if obj is None else str(obj)

def verify_paymob_hmac(body: dict, hmac_param: str, secret: str) -> bool:
    fields = HMAC_FIELDS.get(body.get("type"))
    if not fields or not body.get("obj") or not hmac_param:
        return False
    signed = "".join(_value(body["obj"], f) for f in fields)
    expected = hmac.new(secret.encode(), signed.encode(), hashlib.sha512).hexdigest()
    return hmac.compare_digest(expected, hmac_param.lower())
```

### Testing against Paymob's worked examples

- The HMAC transaction callback page prints its example's concatenated string:
  `1000002024-06-13T11:33:44.592345EGPfalsefalse1920364654097558truefalsefalsefalsetruefalse217503754302852false2346MasterCardcardtrue`.
  Your string builder should produce exactly this from that example.
- The HMAC for card tokens page prints its example's string, the sample HMAC
  secret it used and the resulting digest, so you can check the whole
  computation. The example handlers' tests do both.

### Subscription callbacks (different scheme)

A webhook registered on a subscription gets `hmac` **in the body**, computed
over `{trigger_type}for{subscription_data.id}` (for example
`suspendedfor1264`) with the same HMAC secret and SHA-512. Give these their own
route.

## Common Gotchas

- **SHA512, not SHA256.** Using SHA256 produces a 64-char hex digest that will
  never match Paymob's 128-char digest.
- **Hex, not base64.** Paymob hex-encodes the digest.
- **The signature is a query parameter (`?hmac=`), not a header.** Read it from
  the URL query string.
- **The key list depends on `type`.** `TRANSACTION` signs 20 keys and `TOKEN`
  signs 8. Using the transaction list on a card token fails every time.
- **Exact field order matters.** Join the keys in the documented order. Any
  reordering breaks the match.
- **No separators.** Values are joined with an empty string, not commas or `.`.
- **Booleans must be lowercase `true`/`false`.** JavaScript `Array.join` and JSON
  already produce these; in Python, `str(True)` gives `"True"` — convert
  explicitly (see `_v` above).
- **Not the raw body.** Paymob is unusual: you must parse the JSON to extract the
  fields, then hash the concatenation — not the raw request bytes. Still verify
  before acting on the payload.
- **POST vs GET key paths differ.** POST nests under `obj` (`obj.order.id`,
  `obj.source_data.pan`); Paymob's sample GET redirect flattens them to `order`
  and `source_data.pan`.

## How to Debug Verification Failures

1. Log your computed HMAC and the received `hmac` param side by side.
2. Confirm the digest length is **128** hex chars (SHA512). If it's 64, you're on
   SHA256.
3. Print the concatenated string and check the field order, that booleans are
   lowercase, and that you used the list for the callback's `type`.
4. Confirm you're using the **HMAC secret** from the dashboard, not the API key.
5. Ensure numeric values (`amount_cents`, `id`, `integration_id`, `owner`) are
   stringified exactly as sent (no thousands separators, no trailing `.0`).
