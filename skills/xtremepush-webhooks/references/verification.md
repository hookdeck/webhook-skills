# How to Verify Xtremepush Webhook Signatures

## How Does Xtremepush Sign Webhooks?

Signing is available with the **Signed Payload** auth type only. Every request then has one header (the example in the docs breaks it over several lines):

```
X-Xtremepush-Signature: t=1689343556, v1=2c709b15aee216e2d7097cb57b7c5b422bea3fd938589dafab265506f7651011, v1=874f7108d19848f35f3e70a4751ee2bfae164f4cc74259c405275c235963a141
```

Entries are separated by a comma and a space. Parse by splitting on `,` and trimming each part.

- `t`: Unix timestamp in seconds. Keep it as the exact string from the header; never parse it to a number and re-format it
- `v1`: lowercase hex HMAC-SHA256 (64 characters). A second one appears for up to 24 hours after the Webhook Secret Key is replaced
- Key: the Webhook Secret Key as UTF-8 bytes, used as-is (not hex- or base64-decoded)
- Signed message: `<t>` + `.` + the raw request body bytes
- Ignore keys other than `t` and `v1` (such as `v0`). A header with no `t` fails

Steps: split the header on `,`, split each part on the first `=`, take `t` and every `v1`, recompute the HMAC over `t + "." + rawBody`, and accept if **any** `v1` equals it.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

The docs never name the encoding; the 64-hex example values fix it as lowercase hex. Hex is compared case-insensitively.

## How Do I Compare Signatures Safely?

Validate the format of each `v1` before decoding or comparing it:

- **Node.js:** check that it is exactly 64 hex characters (`/^[0-9a-f]{64}$/i`), then compare the lowercase hex strings as equal-length Buffers with `crypto.timingSafeEqual`. Never call `Buffer.from(sig, 'hex')` on an unvalidated value (it silently drops bad characters). `timingSafeEqual` throws on a length mismatch, so the length check comes first.
- **Python:** check the same 64-hex pattern, then use `hmac.compare_digest` on bytes (`.encode()` both sides). With `str` arguments, a non-ASCII header raises `TypeError` and returns 500 instead of a failed match.

Build the signed message as bytes from the raw body exactly as received. Never decode it to a string and re-encode it, and never `JSON.parse`/`JSON.stringify` it before verifying.

## Where Does the Timestamp Window Go?

The examples don't reject old timestamps by default. **Hookdeck retries and replays resend the original headers, including the original `t`, and Hookdeck itself applies no tolerance**, so a fixed window rejects a legitimate late redelivery (after your receiver was down, or when you replay an event from the dashboard).

The check is opt-in: set `XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS` to a positive whole number of seconds (`t` is Unix seconds). In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyXtremepush` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/xtremepush/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_xtremepush` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default).
- **Widen it:** set a larger value, for example `86400`. Replays can be older still, so a window never fully fits them.
- Anything that isn't a whole number is treated as `0` with a warning at startup. With a window on, a non-numeric `t` fails.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, make the handler idempotent; see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`). `type: '*/*'` makes verification independent of the `Content-Type`.
- **Any method:** verify before checking the method. A GET with no body is verified over zero bytes; once verified, acknowledge it with `200`.
- **Other auth types are unsigned:** only Signed Payload produces `X-Xtremepush-Signature`. None, Basic Auth and Bearer Token deliveries carry no signature and fail verification.
- **Secret as-is:** use the key as shown, as UTF-8.
- **Two `v1` entries:** during the 24 hours after a key is replaced, don't read only the first one.
- **Status codes:** reply `401` for a missing or bad signature and `200` once verified.

## How Do I Debug Verification Failures?

- Check the webhook uses the Signed Payload auth type and that the request has an `X-Xtremepush-Signature` header at all.
- Compare `XTREMEPUSH_WEBHOOK_SECRET` with the Webhook Secret Key (no whitespace or quotes). A newly generated key replaces the old one immediately.
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Xtremepush sent.
- If you set `XTREMEPUSH_WEBHOOK_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
