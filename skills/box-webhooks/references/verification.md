# How to Verify Box Webhook Signatures

## How Does Box Sign Webhooks?

Box V2 deliveries carry two signatures:

```
BOX-SIGNATURE-PRIMARY:   <base64 HMAC-SHA256 made with the primary key>
BOX-SIGNATURE-SECONDARY: <base64 HMAC-SHA256 made with the secondary key>
BOX-DELIVERY-TIMESTAMP:  2016-07-11T10:10:32-07:00
```

- Algorithm: HMAC-SHA256, standard base64 with padding (44 characters), no prefix
- Key: the app's signature key from the Developer Console, used as a UTF-8 string as-is (not hex- or base64-decoded)
- Signed message: the **raw body bytes, then the `BOX-DELIVERY-TIMESTAMP` header value**, no separator
- The whole header is one digest: no list splitting, no `sha256=` parsing

These examples verify `BOX-SIGNATURE-PRIMARY` only, against the primary key, as Hookdeck's Box source does. They don't fall back to the secondary header. During key rotation, use the key that currently signs the primary header.

## Implementation

```javascript
const signed = Buffer.concat([rawBody, Buffer.from(timestamp, 'latin1')]);
const expected = crypto.createHmac('sha256', secret).update(signed).digest('base64');
```

```python
signed = b"".join([raw_body, timestamp.encode("latin-1")])
expected = base64.b64encode(hmac.new(secret.encode(), signed, hashlib.sha256).digest())
```

Build the message as bytes. The header value is encoded latin1 exactly as received (never trimmed or re-formatted) and the body is the raw bytes (never decoded and re-encoded, never `JSON.parse`d first).

Validate the signature's format before comparing: exactly `[A-Za-z0-9+/]{43}=`. Then compare in constant time and case-sensitively: Node checks lengths and uses `crypto.timingSafeEqual` on equal-length Buffers (and never calls `Buffer.from(sig, 'base64')` on an unvalidated value, which silently drops bad characters); Python checks `base64.b64decode(sig, validate=True)` and uses `hmac.compare_digest` on bytes. The examples compare the base64 text rather than decoded bytes, because decoders ignore stray low bits in the last character and Hookdeck compares base64 exactly.

A missing or empty signature or timestamp header, a malformed value, or a mismatch returns `401`.

## Box SDK Option

Box's SDKs have a helper (`WebhookValidator` / `validateMessage`) that checks both keys and **always** enforces the 10-minute timestamp window. Use it if you want both-key checking and a hard window. The examples verify by hand so the same algorithm works in Node, Next.js and FastAPI, and so replays and retries aren't rejected by default.

## Replay Protection

Box suggests rejecting a `BOX-DELIVERY-TIMESTAMP` older than 10 minutes. The examples **don't check it by default**: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck itself applies no tolerance, so a fixed window would reject legitimate redeliveries. To opt in, set `BOX_WEBHOOK_TOLERANCE_SECONDS` to a positive number of seconds (for example `600`). The timestamp is an RFC 3339 date; with a tolerance set, an unparseable one is rejected. Use the body's `id` for idempotency (see webhook-handler-patterns).

## Common Gotchas

- **Raw body:** `express.raw({ type: '*/*' })`, `await request.arrayBuffer()`, `await request.body()`. Re-serialised JSON fails.
- **Order:** body first, then the timestamp. Timestamp first, or body alone, fails.
- **Box's sample code mismatch:** its own sample compares the primary-key digest with the *secondary* header. The prose (primary with primary) is right.
- **Only V2 is signed:** V1 webhooks carry no signature.
- **Dedupe key:** `id` in the body is stable across retries; `BOX-DELIVERY-ID` changes per retry.
- **Methods:** don't make the route POST-only. Verify first for every method, and treat a missing body as empty bytes.
- **Header names are case-insensitive;** Node and Next.js lowercase them.

## Debugging Verification Failures

- Confirm `BOX_WEBHOOK_SECRET` is the **primary** key, with no whitespace or quotes. Did you rotate? Paste the key that signs the primary header.
- Behind a proxy or body-parsing middleware that re-serialises JSON? The signature will fail.
- If you set a tolerance and valid events start failing after downtime, that is the window rejecting retries; raise it or turn it off.
- Webhook created through V1 or a different app? Its keys differ.
