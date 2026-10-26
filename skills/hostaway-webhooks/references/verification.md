# How to Verify Hostaway Webhooks

## Does Hostaway Sign Webhooks?

No. There is no signature header and no timestamp. Authentication is HTTP Basic auth, using the login and password you set on the webhook. Both are optional in Hostaway, and **Set a login and password on the Hostaway webhook. Webhooks without them send nothing to verify.**

## How the Check Works

1. Read `Authorization`. It must be `Basic <base64>` (scheme case-insensitive).
2. Decode the base64 strictly (only the base64 alphabet; `validate=True` in Python) so valid credentials followed by junk are rejected.
3. Split `username:password` on the **first** colon; the password may contain colons.
4. Compare username and password each in constant time and evaluate both before deciding.
5. Any missing or malformed header, or a mismatch: `401`.

## Constant-Time Comparison

- **Node:** check lengths then `crypto.timingSafeEqual` on equal-length Buffers, or hash both sides with SHA-256 first (the examples do this).
- **Python:** `hmac.compare_digest` on **bytes**. Encode both sides with UTF-8; passing `str` raises `TypeError` on non-ASCII input.

## What a Static Credential Does Not Give You

A static shared credential authenticates the sender, not the body. There is no signature over the payload and no timestamp, so:

- A captured request can be replayed. Make handlers idempotent.
- Anyone who learns the credential can forge events. Use HTTPS only and rotate the login and password in Hostaway if they leak.

## Common Gotchas

- **No 401 challenge:** Hookdeck never sends one (no `WWW-Authenticate` round trip), so credentials must arrive with each request.
- **Methods:** the HTTP method isn't documented. Check the credential first for GET, POST, PUT, PATCH and DELETE alike, and allow the method on the Hookdeck source.
- **Empty or non-JSON bodies:** acknowledge them; don't reject.
- **Raw body:** with Express use `express.raw({ type: '*/*' })`, authenticate, then parse.

## Debugging 401s

- No login and password set on the Hostaway webhook: nothing is sent to verify.
- Environment variables unset or different from the values in Hostaway (the handler rejects everything when unconfigured).
- Password contains a colon and the code splits on every colon: split on the first only.
- A proxy strips the `Authorization` header.
