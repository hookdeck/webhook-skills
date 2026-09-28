# How to Verify WordPress.com Webhook Signatures

**You cannot. WordPress.com webhooks are unsigned.** This page explains why, what
to do instead, and which single HMAC is legitimate in this flow (Hookdeck's).

## Why There Is Nothing to Verify

The [WordPress.com webhooks documentation](https://wordpress.com/support/webhooks/)
describes **no secret, no signature header, no token, no auth option and no
custom headers**. The only inputs they describe are the action, the fields,
and the URL.

The lineage corroborates it. The feature derives from HookPress
(`mitcho/hookpress`), whose sender — `hookpress_generic_action()` in
`includes.php` — sets only `user-agent`, `body` and `referer` and calls
`wp_remote_post`. There is no signing step anywhere in it.

So, concretely:

- **Do not write an HMAC or signature verifier.** No `crypto.createHmac`, no
  `hmac.new`, no timestamp tolerance window.
- **Do not check for an invented header.** There is no
  `X-WordPress-Signature`, `X-WP-Signature` or `X-WPCOM-Signature`. Writing one
  produces a handler that rejects every real delivery (or, worse, pretends to
  check something).
- **Do not fabricate a source-IP allowlist.** WordPress.com publishes none for
  this feature.
- **Do not invent delivery-id, event-id or timestamp headers.** None exist, which
  is why idempotency has to key on payload fields.
- **There is no handshake, challenge or verification request** to answer.
- **`X-WC-Webhook-Signature` is WooCommerce**, a different product. If you are
  looking at that header you are in the wrong skill — use
  [woocommerce-webhooks](https://github.com/hookdeck/webhook-skills/tree/main/skills/woocommerce-webhooks).

Hookdeck models it the same way: the `WORDPRESS_COM` source type (slug
`wordpress-com`) is schema-only, `http_method_managed_post`, with **no
verification controller** at all.

## What to Do Instead: Channel-Level Protection

### 1. A Secret Token in the Webhook URL (the main control)

You control the URL you register, so put a long random secret in its query
string and compare it in **constant time**:

```
https://your-app.example.com/webhooks/wordpress-com?token=<32+ random bytes>
```

**Node.js**

```javascript
const crypto = require('crypto');

function verifyUrlToken(provided) {
  const expected = process.env.WORDPRESS_COM_WEBHOOK_TOKEN;
  // Fail CLOSED: an unconfigured endpoint must not accept everything.
  if (!expected) throw new Error('WORDPRESS_COM_WEBHOOK_TOKEN is not set');
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Length-guard FIRST — timingSafeEqual throws on a length mismatch.
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Python**

```python
import hmac, os

def verify_url_token(provided: str | None) -> bool:
    expected = os.getenv("WORDPRESS_COM_WEBHOOK_TOKEN")
    if not expected:
        raise RuntimeError("WORDPRESS_COM_WEBHOOK_TOKEN is not set")  # fail closed
    if not provided:
        return False
    # Compare BYTES: compare_digest() raises TypeError on non-ASCII str input,
    # and the token is attacker-supplied.
    return hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
```

Behaviour to implement:

| Situation | Response |
|---|---|
| Token matches | `200` |
| Token missing or mismatched | `401` |
| `WORDPRESS_COM_WEBHOOK_TOKEN` unset | `500` — fail closed, never accept |

**Honest caveats.** The docs neither mention nor forbid a query string on the
webhook URL; this is the standard pattern for unsigned senders, **not a
WordPress.com feature**. The token is visible to every site admin who can open
Settings → Webhooks, and it will appear in proxy and access logs. Rotate it if
exposed, and never log the full request URL.

### 2. HTTPS Only

Register an `https://` URL. Without a signature, TLS is the only thing
protecting the token in transit.

### 3. Treat the Payload as Untrusted

An unsigned payload proves nothing about its origin or its contents. Before
doing anything consequential, re-fetch authoritative data from the WordPress.com
REST API:

```bash
curl https://public-api.wordpress.com/rest/v1.1/sites/{site}/posts/{ID}
```

Anyone who learns the URL can post arbitrary `post_title` / `comment_content`
values at you, and `comment_approved` may be `0` (pending) or `spam`, so never
publish `comment_content` straight from the payload.

### 4. With Hookdeck: Verify Hookdeck's Signature

Route WordPress.com through Hookdeck and the Hookdeck Source URL becomes the
secret endpoint. Hookdeck's WordPress.com source performs **no signature check**
(there is nothing to check), but the request Hookdeck then delivers to your app
**is** signed. Verify that one:

```javascript
const crypto = require('crypto');

// This is HOOKDECK'S signature over the forwarded body — NOT WordPress.com's.
// HMAC-SHA256, base64, keyed by your Hookdeck signing secret.
// headers: the incoming request headers (lower-cased keys, as in Node).
function verifyHookdeckSignature(rawBody, headers) {
  const secret = process.env.HOOKDECK_WEBHOOK_SECRET;
  if (!secret) throw new Error('HOOKDECK_WEBHOOK_SECRET is not set'); // fail closed
  const expected = Buffer.from(
    crypto.createHmac('sha256', secret).update(rawBody).digest('base64')
  );
  // While a rolled secret is still active, Hookdeck sends the second signature
  // in a SEPARATE header, x-hookdeck-signature-2 — not comma-joined in one.
  return [headers['x-hookdeck-signature'], headers['x-hookdeck-signature-2']]
    .filter((sig) => typeof sig === 'string' && sig.length > 0)
    .some((sig) => {
      const a = Buffer.from(sig);
      return a.length === expected.length && crypto.timingSafeEqual(a, expected);
    });
}
```

`x-hookdeck-signature` is only present when **Hookdeck Signature** auth is set on
the Destination ([Hookdeck docs](https://hookdeck.com/docs/destinations)); the
algorithm and the `-2` rotation header are described in
[Hookdeck's authentication docs](https://hookdeck.com/docs/authentication).

Use the **raw body** for that HMAC, before any form or JSON parsing. This is the
only HMAC in the whole flow, and it must be labelled as Hookdeck's wherever it
appears.

## Common Gotchas

- **Expecting JSON.** The body is `application/x-www-form-urlencoded`, so
  `await request.json()` throws and `express.json()` leaves `req.body` empty.
  Parse form-encoded first, and accept JSON only defensively.
- **Reading the wrong discriminator.** There is no `type` or `event` field — the
  discriminator is **`hook`** (`publish_post`, `publish_page`, `comment_post`).
- **Assuming a field exists.** Only the fields the admin ticked are sent. `ID`,
  `post_title` and even `comment_ID` can all be absent.
- **Treating values as typed.** Everything is a string: `ID=123`,
  `comment_approved=1`.
- **`timingSafeEqual` throwing.** It raises on a length mismatch — always
  length-guard first. In Python, `hmac.compare_digest` raises `TypeError` on
  non-ASCII `str`, so compare encoded bytes.
- **Failing open.** An unset `WORDPRESS_COM_WEBHOOK_TOKEN` must produce a 500,
  not a blanket accept.
- **Rejecting unknown hooks.** Log and return 2xx. A 4xx buys nothing from a
  sender with no documented retry policy.

## Debugging Verification Failures

| Symptom | Cause |
|---|---|
| Every delivery gets `401` | The registered URL is missing `?token=`, or the token was rotated in `.env` but not in Settings → Webhooks. |
| Every delivery gets `500` | `WORDPRESS_COM_WEBHOOK_TOKEN` is not set in the environment — the intended fail-closed behaviour. |
| `req.body` is empty / `{}` | No `express.urlencoded()` on the route (or you mounted only `express.json()`). |
| `await request.json()` throws `Unexpected token` | The body is form-encoded. Use `formData()` / `URLSearchParams`. |
| `hook` is `undefined` | You are reading a nested `data`/`payload` object that does not exist; the payload is flat. |
| A crash on `.toLowerCase()` of `post_title` | The field was not ticked in the webhook's field list. |
| The same post processed twice | Expected: `publish_post` also fires on edits. Dedupe on `hook` + `ID` + `post_modified_gmt`. |
| Looking for `X-WC-Webhook-Signature` | Wrong provider — that is WooCommerce. |

## Summary

| Question | Answer |
|---|---|
| Signature header | **None** |
| Algorithm | **None** |
| Signed content | **None** |
| Standard Webhooks (`webhook-id`/`webhook-timestamp`/`webhook-signature`) | **No** |
| Authentication | **None from the provider.** Use a URL query token you generate. |
| IP allowlist | **None published** |
| Handshake / challenge | **None** |
| Retries | **Not documented — assume none** |
| Practical controls | HTTPS + secret URL token (constant-time, fail closed) + REST API re-fetch, and Hookdeck's `x-hookdeck-signature` when proxied |
