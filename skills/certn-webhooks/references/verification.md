# How to Verify Certn Webhook Signatures

## How Does Certn Sign Webhooks?

Signing is opt-in. When it is enabled, every request has one header (on a single line; the line breaks below are for clarity):

```
Certn-Signature: t=1609459200,
  v1=09efe4234a3cd00e44c20bcc00ef1b4f9d3f33ea87a7f04bc0d87fc0ef0f04e8,
  v1=b36793a72f8bd71c8a165bd4b5aefb9fe9f5ac272ccbc8971c82c8c89cade770
```

In real deliveries a space follows each comma. Parse by splitting on `,` and trimming each part.

- `t`: Unix timestamp in seconds when Certn generated the signature
- `v1`: hex HMAC-SHA256. There can be several, one per active secret during the 48 hour window after a secret roll
- Key: the signing secret as a UTF-8 string
- Signed message: `"<t>.<request body as text>"`
- Ignore every scheme that is not `v1` (Certn tells you to, to prevent downgrade attacks)

Steps: split the header on `,`, split each part on the first `=`, take `t` and every `v1`, recompute the HMAC over `t + "." + rawBody`, and accept if **any** `v1` equals it. Reject a header with no `t` or no `v1`.

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${t}.`).update(rawBody).digest('hex');
```

## How Do I Compare Signatures Safely?

- **Node.js:** check that the received `v1` is exactly 64 hex characters (`/^[0-9a-f]{64}$/i`) before comparing. `Buffer.from(x, 'hex')` silently truncates invalid hex, so compare the lowercase hex strings as equal-length UTF-8 Buffers with `crypto.timingSafeEqual` instead. `timingSafeEqual` throws on a length mismatch, so the 64-char check comes first.
- **Python:** use `hmac.compare_digest` on bytes (`.encode()` both sides). With `str` arguments, a non-ASCII header raises `TypeError` and returns 500 instead of a failed match.

## Where Does the Timestamp Window Go?

Certn's docs suggest rejecting a payload whose `t` is too old, and note that Certn generates a new timestamp and signature on every retry. The examples don't apply a window by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (for example after your receiver was down, or when you replay an event from the dashboard).

The check is opt-in: set `CERTN_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyCertn` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/certn/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_certn` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** set a larger value, for example `86400`. Replays from Hookdeck can be older still, so a window never fully fits replays.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, make the handler idempotent on the applicant `id` and `report_status`; see webhook-handler-patterns.

## Common Gotchas

- **Raw body:** the signature covers the exact body text. Do not parse and re-serialise JSON first (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). Certn notes that Express needs middleware to get the original string; `type: '*/*'` makes verification independent of the `Content-Type`.
- **Unsigned deliveries:** if signed payloads aren't turned on in Certn there is no `Certn-Signature` header, and verification fails with "missing header".
- **Secret as-is:** use the secret string as shown on the Partner page, as UTF-8.
- **Several `v1`:** during a secret roll, don't read only the first one.
- **Status codes:** reply 400 for a bad signature; Certn retries on 408, 500, 502, 503, and 504.

## How Do I Debug Verification Failures?

- Check signed payloads are enabled and that the request has a `Certn-Signature` header at all.
- Compare `CERTN_WEBHOOK_SECRET` with the secret on the Partner page (no whitespace or quotes).
- A body-parsing middleware ahead of your route (`express.json()`) re-serialises the body and breaks the signature.
- Behind a proxy that rewrites the body? Compute the HMAC over what Certn sent.
- If you set `CERTN_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a retry or replay) fails by design.
