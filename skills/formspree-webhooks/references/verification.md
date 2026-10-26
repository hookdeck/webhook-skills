# How to Verify Formspree Webhook Signatures

## How Does the Signature Work?

Formspree sends one header:

```
Formspree-Signature: t=<unix seconds>,v1=<hex>
```

`v1` is the lowercase hex HMAC-SHA256 of this message, keyed with the webhook's signing secret as UTF-8 bytes:

```
<t>.<raw request body bytes>
```

`t` is used exactly as it appears in the header (a string), then a literal `.`, then the body bytes exactly as received. Formspree does **not** sign the body alone.

## Implementation

Node (Express: `express.raw({ type: '*/*' })`; Next.js: `Buffer.from(await request.arrayBuffer())`):

```javascript
const HEX_64 = /^[0-9a-fA-F]{64}$/;

function verify(rawBody, header, secret) {
  let t, tCount = 0;
  const sigs = [];
  for (const field of header.split(',')) {
    const i = field.indexOf('=');
    if (i === -1) continue;
    const key = field.slice(0, i).trim();
    const value = field.slice(i + 1).trim();
    if (key === 't') { t = value; tCount++; } else if (key === 'v1') sigs.push(value);
  }
  const candidates = sigs.filter((s) => HEX_64.test(s));
  if (tCount !== 1 || !t || candidates.length === 0) return false;

  const expected = crypto.createHmac('sha256', secret).update(`${t}.`).update(rawBody).digest();
  let ok = false;
  for (const s of candidates) {
    ok = crypto.timingSafeEqual(Buffer.from(s.toLowerCase(), 'hex'), expected) || ok;
  }
  return ok;
}
```

Python (FastAPI: `await request.body()`):

```python
expected = hmac.new(
    secret.encode("utf-8"), t.encode("utf-8") + b"." + raw_body, hashlib.sha256
).hexdigest().encode("ascii")
ok = any(hmac.compare_digest(expected, s.lower().encode("ascii")) for s in sigs if _HEX_64.fullmatch(s))
```

The complete versions, with header parsing and tests, are in [examples/express/](../examples/express/), [examples/nextjs/](../examples/nextjs/) and [examples/fastapi/](../examples/fastapi/).

## Validation Rules

- Missing or empty header, no `t=` value, no valid `v1=`: `401`.
- `v1` must be exactly 64 hex characters. Hex is case-insensitive, so lowercase before comparing. Check the format *before* decoding: `Buffer.from(sig, 'hex')` silently drops bad characters.
- Compare equal-length values in constant time (`crypto.timingSafeEqual`, `hmac.compare_digest` on bytes, never `str`).
- The header can contain more than one `v1=` entry (for example during key rotation). Accept if any matches. Ignore other keys such as `v0`.
- The secret is used as-is: don't hex- or base64-decode it.

## Should I Reject Old Timestamps?

Formspree's docs list this as optional. This skill leaves it **off by default**: Hookdeck retries and replays resend the original headers and timestamp, and Hookdeck's Formspree source applies no tolerance, so a fixed window would reject legitimate retries. To opt in, set `FORMSPREE_WEBHOOK_TOLERANCE_SECONDS` (Unix seconds; the examples then require a numeric `t` within that distance of now). Because `t` is inside the signed message, an attacker can't refresh it on a replay.

## Common Gotchas

- Signing only the body (missing the `t.` prefix).
- Parsing and re-stringifying JSON before verifying; use the raw bytes.
- Comparing against the whole header instead of the `v1` value.
- Using a different secret, such as an API key, instead of the webhook's signing secret.
- Reformatting `t` (for example `parseInt` then back to a string) before building the message; use the received string.
- A body parser consuming the stream first. In Express, register `express.raw({ type: '*/*' })` on the route.
- Build Hooks send an empty body; it is still signed (HMAC of `<t>.`).

## How to Debug Verification Failures

1. Log the raw body length and the header; confirm the header has `t=` and `v1=`.
2. Compute the signature by hand over `<t>.` + the exact bytes and compare with `v1`.
3. If only some requests fail, check for a proxy or middleware altering the body.
4. If every request fails, confirm you copied the webhook's signing secret, with no extra whitespace.
5. Hookdeck: confirm the source's secret matches; its Formspree source verifies the signature before forwarding.
