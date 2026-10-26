# How to Verify Nooks Webhook Signatures

## How Does Nooks Sign Webhooks?

Every delivery after activation has one header (illustrative values):

```
x-webhook-signature: t=1765253196145,s=Xk3c0sV0yQe3h1m2kqD1b7m1Zr5c1JtqkK7m0yXr0vE=
```

- `t`: Unix timestamp in **milliseconds** when the request was sent
- `s`: base64 HMAC-SHA256 (standard base64, with `=` padding)
- Key: the signing key Nooks shows once after you save the URL, used as a UTF-8 string
- Signed message: `"<t>.<raw request body>"` (`t` exactly as sent, a literal dot, the raw body)

Parse the header by splitting on `,` and then splitting each part on the **first** `=` only, because the base64 signature ends in `=`. Splitting on every `=` truncates it. Recompute the HMAC and compare in constant time.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('base64');
const a = Buffer.from(s, 'utf8'), b = Buffer.from(expected, 'utf8');
const ok = a.length === b.length && crypto.timingSafeEqual(a, b); // length check first: it throws otherwise
```

Compare the base64 *strings* as equal-length UTF-8 buffers. Don't base64-decode the header value: a lenient decoder ignores trailing junk and invalid characters, which would accept signatures that don't match byte for byte. In Python use `hmac.compare_digest(s.encode("utf-8"), expected_bytes)` with bytes on both sides; passing a `str` containing a non-ASCII character raises `TypeError` and turns a bad header into a 500.

## Where Does the Timestamp Window Go?

Nooks recommends rejecting requests whose `t` is more than 5 minutes old. The examples don't do this by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard). Nooks's own retries run for up to 30 minutes, so a 5-minute window can reject those too.

The check is opt-in: set `NOOKS_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyNooks` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/nooks/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_nooks` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `1800` to cover Nooks's 30-minute retry span, or `86400` for a day. Replays from Hookdeck can be older still, so a window never fully fits replays.
- **Units:** `t` is milliseconds and the variable is seconds. The code divides the millisecond difference by 1000 before comparing; do the same if you write your own check (`Math.abs(Date.now() - t) / 1000 > tolerance`).
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, rely on `callData.callId` for idempotency; see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). In Express, `type: '*/*'` makes verification independent of the `Content-Type`.
- **Missing period:** the signed string is `t + "." + rawBody`. `t + rawBody` never verifies.
- **Key as-is:** use the signing key exactly as shown, as UTF-8. No base64 decoding, no prefix stripping, no stray whitespace.
- **Key shown once:** Nooks displays it only after the URL is saved.
- **Unsigned activation ping:** it has no `x-webhook-signature` header and must still get a 2xx. The examples reject unsigned requests by default; set `NOOKS_ACCEPT_UNSIGNED_PING=true` only while you save a URL that points straight at your app, so the ping gets 200 without being processed.
- **Status codes:** Nooks's own guide replies 401 for a bad signature. The examples do the same.
- **Respond quickly:** 15 second timeout. Acknowledge, then process asynchronously.

## How Do I Debug Verification Failures?

- Compare `NOOKS_WEBHOOK_SECRET` with the key Nooks showed (no whitespace or quotes).
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Nooks sent.
- If you set `NOOKS_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
- One failed verification on a Hookdeck source right after you save the URL is the unsigned activation ping, not a problem.
