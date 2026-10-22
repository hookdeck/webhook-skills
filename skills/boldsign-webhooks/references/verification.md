# How to Verify BoldSign Webhook Signatures

## How Does BoldSign Sign Webhooks?

Every event carries `X-BoldSign-Signature`:

```
t=1668693823, s0=9b7adf82fbd470cce0cdb8106d7cb023e547999ada5e8c9ad02306cd22ee7ca9
t=1668708521, s0=c10e26bf...54ab, s1=62a1abe1...21f6      # secret rolled, old key still valid
```

- Algorithm: HMAC-SHA256, lowercase hex
- Key: the webhook signing secret (**Reveal** on the webhook overview page), used as-is
- Signed message: `<t>.<raw request body>`, where `t` is the header's value
- `s0`: signature from the current key. `s1`: signature from the old key, present only during a rollover
- Authentication is the signature alone; there is no API key or basic auth from BoldSign unless you add custom headers yourself

BoldSign's docs show Node, Python, Ruby, and C# samples (the C# SDK has `WebhookUtility.ValidateSignature`). The skill's examples verify manually so Node, Python, and Next.js all share one algorithm.

## Implementation

```javascript
const expected = crypto.createHmac('sha256', secret)
  .update(`${timestamp}.`).update(rawBody).digest('hex');
const ok = signatures.some((sig) => safeEqual(sig, expected)); // s0 or s1
```

Parse the header by splitting on `,`, trimming each item (there is a space after the comma), and splitting on the first `=`.

## Replay Protection

BoldSign suggests comparing `t` with the current time after the signature matches (5 minutes in its samples). The examples **don't check it by default**: retries and replays (BoldSign's, Hookdeck's, manual resends) carry the original `t`, so a window would reject legitimate late redeliveries. To opt in, set `BOLDSIGN_TIMESTAMP_TOLERANCE_SECONDS` to a positive number of seconds (for example `300`). A value that isn't a whole number is treated as `0`, with a warning at startup. Use `event.id` for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** the signature covers the exact bytes. Do not parse JSON before verifying (`express.raw({ type: '*/*' })`, `request.text()`, `await request.body()`). BoldSign's docs sample only reads `application/json`; `type: '*/*'` makes any content type verify.
- **Verification event:** the setup `Verification` POST must get a `200` within 10 seconds. Return it before the signature check, so setup works before you've stored the secret.
- **Spaces in the header:** `t=..., s0=...` has a space after the comma; trim before comparing keys.
- **Accept s1:** during rollover s0 may be from a key you haven't deployed yet.
- **Constant-time compare:** compare each signature with `timingSafeEqual` / `hmac.compare_digest`, after checking length.
- **Header names are case-insensitive;** Node lowercases them.

## Debugging Verification Failures

- Confirm `BOLDSIGN_WEBHOOK_SECRET` is the secret of *this* webhook (sandbox and live differ, each webhook has its own), with no whitespace or quotes.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will fail.
- Use **Webhook History** in BoldSign to see the response code you returned and to resend an event.
- If you set a tolerance and valid events start failing after downtime, that is the window rejecting retries; raise it or turn it off.
