# How to Verify Hail Webhook Signatures

## How Does Hail Sign Webhooks?

Every request has one signature header:

```
X-Hail-Signature: t=1700000000,v1=72f7940d13ca8528cf655a04e82dabfe90a531e239241fda9bdff72980d33a4a
```

- `t`: Unix timestamp in seconds
- `v1`: lowercase hex HMAC-SHA256. Hail's signer emits one `v1`; the examples accept the header if **any** `v1` matches, which is harmless
- Key: the whole signing secret string, including `whsec_`, as UTF-8 bytes
- Signed message: `"<t>.<raw request bytes>"`

Split the header on `,`, trim each part (a space after the comma is allowed), split each on the first `=`, take `t` and every `v1`. Reject a header with no `t` or no `v1`.

Worked example from Hail's docs (secret `whsec_example`, window off):

```
body:   {"id":"evt_123","type":"email.received","data":{"id":"em_1"}}
header: t=1700000000,v1=72f7940d13ca8528cf655a04e82dabfe90a531e239241fda9bdff72980d33a4a
```

## This Is Not Standard Webhooks

The secret looks like `whsec_...`, but the `standardwebhooks` and `svix` libraries don't apply: they base64-decode the part after `whsec_` and expect `webhook-id` / `webhook-timestamp` / `webhook-signature` headers. Hail uses neither. Use plain HMAC.

## Constant-Time Comparison

- **Node:** check the received `v1` is exactly 64 hex chars (`/^[0-9a-f]{64}$/i`) before comparing; `Buffer.from(x, 'hex')` silently truncates invalid hex. The examples compare lowercase hex strings as equal-length UTF-8 Buffers with `crypto.timingSafeEqual`.
- **Python:** `hmac.compare_digest` on bytes (encode both sides), so a non-ASCII header gives 401/400 instead of a 500.

## Where Does the Timestamp Window Go?

The examples don't reject old timestamps by default. **Hookdeck retries and replays resend the original request, including the original `t`**, so a 5-minute window rejects a legitimate late redelivery (your receiver was down, or you replay from the dashboard). Hail's own retries are different: its worker re-signs every attempt with the current time, so they carry a fresh `t` even late in the 24-hour ladder.

The check is opt-in: set `HAIL_TIMESTAMP_TOLERANCE_SECONDS` to a positive whole number of seconds. In each example it lives in one place:

| Example | Where |
|---------|-------|
| Express | `timestampToleranceSeconds()` and the `tolerance > 0` branch in `verifyHail` (`src/index.js`) |
| Next.js | the same two in `app/webhooks/hail/route.ts` |
| FastAPI | `timestamp_tolerance_seconds()` and the `tolerance > 0` branch in `verify_hail` (`main.py`) |

- **Drop it:** leave the variable unset or `0` (default). Delete the `tolerance > 0` branch if you want the code gone.
- **Widen it:** pick a value that covers how late a Hookdeck retry or replay can arrive. Hail's own retries are re-signed, so they don't need a wider window.
- Anything that isn't a whole number is treated as `0` with a warning at startup.

The signature covers `t`, so an attacker can't refresh an old request's timestamp. Without a window, dedupe on `X-Hail-Delivery` (stable across retries) or the event `id`.

## Common Gotchas

- **Raw body:** hash the exact bytes. Don't re-serialise JSON. Use `express.raw({ type: '*/*' })` (Hail's docs show `application/json`, but `*/*` works whatever the Content-Type), `request.text()`, or `await request.body()`.
- **Secret as-is:** don't strip `whsec_` or base64-decode.
- **Secret shown once:** returned only at create (and by `rotate-secret`, which invalidates the old secret immediately, with no overlap period).
- **Status codes:** reply 400 for a bad signature, any 2xx on success.

## How Do I Debug Verification Failures?

- Compare `HAIL_WEBHOOK_SECRET` with the secret from the create response (no whitespace or quotes, `whsec_` included).
- A body parser ahead of your route (`express.json()`) breaks the signature.
- If you set `HAIL_TIMESTAMP_TOLERANCE_SECONDS`, an old `t` (a Hookdeck retry or replay) fails by design.
- In Hookdeck, confirm the whole secret was pasted, `whsec_` included.
