# How to Verify Khipu Webhook Signatures

## How Does Khipu Sign Webhooks?

Every notifications API 3.0 delivery carries:

```
x-khipu-signature: t=1711965600393,s=rq08YUGSaWa1D0RAwhMnJTRHMNmY4ToCn2Gd6G9LaDg=
```

- Items are `key=value`, separated by a comma. `t=` is the timestamp (Unix **milliseconds**), `s=` the signature.
- Algorithm: HMAC-SHA256, standard padded base64 (44 characters).
- Key: the merchant secret of the collecting account, used as UTF-8 bytes (not hex- or base64-decoded).
- Signed message: the `t` string exactly as in the header, a literal `.`, then the raw request body bytes.
- Authentication is the signature alone.

> Only notifications API version 3.0 is supported. Version 1.3 notifications aren't signed this way and fail verification.

## Implementation

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('base64');
```

```python
digest = hmac.new(secret.encode(), t.encode() + b"." + raw_body, hashlib.sha256).digest()
expected = base64.b64encode(digest)
```

Khipu's own sample is the same computation (`hmac.new(secret_bytes, hash_bytes, hashlib.sha256).digest()` then `base64.b64encode`).

Steps the examples follow:

1. Read the raw body as bytes. Build the signed message as bytes; never decode and re-encode it.
2. Parse the header: first `t=`, every `s=`. No `t=` fails. Ignore other keys.
3. Check each `s` is exactly `[A-Za-z0-9+/]{43}=` **before** comparing. Don't decode it first: `Buffer.from(s, 'base64')` silently drops bad characters, and a value whose last character has stray low bits decodes to the same bytes but is not what Khipu sent (Hookdeck rejects it, so the skill does too).
4. Compare strings in constant time (`crypto.timingSafeEqual` after a length check; `hmac.compare_digest` on bytes).
5. Accept if any `s` matches. Otherwise respond `401`.

## Test Vector

The worked example from Khipu's docs, used in every example's tests:

- Secret: `1a4cbbbeb8bdb7e1d73572b9cc43ce4ce18f79d9`
- Header: `t=1711965600393,s=rq08YUGSaWa1D0RAwhMnJTRHMNmY4ToCn2Gd6G9LaDg=`
- Body: the exact JSON string in the docs (`payment_id` `zfxnocsow6mz`, amounts as strings like `"1000.0000"`, `https:\/\/` escaped slashes, payer `Cobrador de desarrollo #990.939`). It differs from the docs' pretty-printed JSON, which shows why the received bytes matter.

## Replay Protection

The examples **don't check the timestamp by default**. Hookdeck retries and replays resend the original headers, and Hookdeck itself applies no tolerance, so a window would reject legitimate late redeliveries. To opt in, set `KHIPU_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`); `t` is milliseconds, so the examples compare `|now_ms - t| / 1000`. Unset, `0` or a non-numeric value leaves it off (a non-numeric value logs a warning). Use `payment_id` for idempotency.

## Common Gotchas

- **Raw body:** don't parse or re-serialise JSON before verifying (key order, spacing, escaped slashes and `"1000.0000"` strings all change the bytes). Use `express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`.
- **Version 3.0 only:** a collection without `notify_api_version` `"3.0"` sends 1.3 notifications with a `notification_token`; they fail this check.
- **Milliseconds:** `t` is milliseconds, not seconds.
- **Use `t` as a string:** never parse it to a number and format it back.
- **Secret:** the collecting account's merchant secret, with no whitespace or quotes.
- **Header name:** case-insensitive; Node and Starlette lowercase it.

## Debugging Verification Failures

- Confirm the collection was created with `notify_api_version` `"3.0"` and the secret is for the account that created it (staging and production differ).
- Log the raw body length and compare with Khipu's records; any middleware that re-serialises JSON breaks the signature.
- If you set a tolerance and valid events fail after downtime, the window is rejecting retries; raise it or turn it off.
