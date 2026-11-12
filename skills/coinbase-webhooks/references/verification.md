# How to Verify Coinbase (CDP) Webhook Signatures

Sources: [Verify signatures](https://docs.cdp.coinbase.com/webhooks/verify-signatures) and
[Transfers verification](https://docs.cdp.coinbase.com/webhooks/transfers/verification).
Every CDP webhook domain uses the same scheme.

## Which Header Carries the Signature?

`X-Webhook-Signature`. The docs say: "`X-Hook0-Signature` is deprecated and will eventually
be removed. Use `X-Webhook-Signature` going forward. Both headers are sent with identical
values and use the same verification algorithm and webhook secret." Read
`X-Webhook-Signature` first and fall back to `X-Hook0-Signature`. The `hook0` name is
correct, not a typo.

## What Does the Header Look Like?

```
t=1728394718,v0=9f8e7d6c5b4a...,h=content-type x-event-id x-event-type,v1=a1b2c3d4e5f6...
```

| Part | Meaning |
|------|---------|
| `t` | Unix timestamp in **seconds** when the webhook was sent |
| `v0` | HMAC-SHA256 over `{t}.{body}`: covers the body and timestamp |
| `h` | **Space-separated, ordered** list of header names included in `v1` |
| `v1` | HMAC-SHA256 over `{t}.{h}.{headerValues}.{body}`: also covers those headers |

The order of the parts is not guaranteed, so parse by key. Split on `,` (`h` has no commas),
then split each part on the **first** `=`. Don't split the whole header on whitespace,
because `h` contains spaces.

## What Exactly Is Signed?

The algorithm is **HMAC-SHA256** and the digest is **lowercase hex**, not base64. The key is the
subscription secret's UTF-8 bytes, used as-is.

**v1:**

```
headerValues   = values of each header named in h, in h's order, joined by "."
                 (a missing header contributes "")
signed_payload = {t}.{h}.{headerValues}.{raw_body}
```

For `t=1728394718` and `h=content-type x-event-id`, with `Content-Type: application/json`
and `X-Event-Id: abc`:

```
1728394718.content-type x-event-id.application/json.abc.{raw body}
```

The `h` string goes in literally, spaces and all.

**v0:**

```
signed_payload = {t}.{raw_body}
```

## Should I Verify v0 or v1?

Both digests are included on every request. The verify-signatures page says: "Unless you want to
bind the headers, which is unnecessary for most use cases, use `v0`."

The examples verify **`v1` when the header has both `v1=` and `h=`, and `v0` otherwise**.
They accept the request if that digest matches. The reasoning:

- `v1` is documented on both CDP verification pages, and it's what Hookdeck's Coinbase source
  verifier computes.
- `v0` is documented only on `/webhooks/verify-signatures`.
- `v1` also covers `X-Event-Type` and `X-Event-Id`, which the handler routes and de-duplicates on.

**Use `v0` instead** if a proxy in front of your app rewrites any header named in `h` (for
example, it normalizes `Content-Type`), because that breaks `v1`. The examples accept a
`scheme: 'v0'` option for this.

## Why Must I Use the Raw Body?

The docs say: "You must use `express.raw()` middleware instead of `express.json()` to preserve
the raw request body. The signature is computed against the raw bytes, so parsing the JSON
first will break verification."

| Framework | Raw body |
|-----------|----------|
| Express | `express.raw({ type: 'application/json' })` → `req.body` is a `Buffer` |
| Next.js App Router | `await request.text()` |
| FastAPI | `await request.body()` |

Never re-serialize parsed JSON to verify it.

## How Should I Compare Signatures?

Use a constant-time comparison: `crypto.timingSafeEqual` in Node, `hmac.compare_digest` in
Python. **Validate first.** Node's `timingSafeEqual` throws on buffers of unequal length.
The docs' sample calls `Buffer.from(providedSignature, 'hex')` with no length check, so a
malformed or odd-length signature makes it throw and return a 500. Check
`/^[0-9a-f]{64}$/i` before comparing and return 400 if it fails.

## What About Replay Protection?

`t` is covered by both digests, so tampering with the timestamp already breaks the MAC. CDP's
reference implementation also rejects old webhooks, with a 5-minute default ("The default
5-minute window prevents replay attacks"). The examples:

- check that `t` is a positive integer string before doing arithmetic with it
- reject when `|now - t| > MAX_AGE_SECONDS` (300)

**Trade-off:** CDP retries with exponential backoff for up to 60 retries per event, so a strict
window will reject legitimate late retries. Pair the window with idempotency on `X-Event-Id`
rather than tightening it. `t` is a timestamp, not a nonce.

## What If the Secret Isn't Configured?

Return **500** ("server configuration error"). Never fail open, and never call HMAC with
`undefined`.

## What Is NOT Part of CDP Webhook Auth?

- No asymmetric keys (RSA, Ed25519, ECDSA). The scheme is symmetric HMAC.
- No `sha256=` prefix, no `whsec_` prefix, no base64.
- No `X-CC-Webhook-Signature`. That's Coinbase Commerce.
- No `CB-ACCESS-*` or `CB-SIGNATURE`. Those sign requests *to* Coinbase APIs.
- No bearer token, basic auth, mTLS or subscription handshake.
- No published egress IP ranges, so don't build an IP allowlist.

## Common Signature Verification Errors

| Symptom | Likely cause |
|---------|--------------|
| Every request fails | Body parsed before verifying (`express.json()`, `request.json()`), or wrong secret |
| `v1` fails but `v0` passes | A proxy changed a header named in `h`. Switch to `v0` |
| Signature with a stray `=` | Stripped 2 characters from `v1=` instead of 3. Parse on the first `=` |
| 500 on garbage signatures | `timingSafeEqual` length mismatch. Validate the hex first |
| Fails after Coinbase drops a header | Code reads only `X-Hook0-Signature`. Read `X-Webhook-Signature` first |
| Old deliveries rejected | Timestamp window. Check server clock (NTP) |

## How to Debug Verification Failures

1. Run `cdp data webhooks subscriptions events <ID>` to see attempts, HTTP responses and retry
   counts.
2. Log the parsed `t` and `h` (never the secret) and the byte length of the raw body.
3. Recompute `v0` by hand: `printf '%s.%s' "$T" "$BODY" | openssl dgst -sha256 -hmac "$SECRET"`.
4. Confirm the secret came from **this** subscription's create response. Each subscription
   has its own.
