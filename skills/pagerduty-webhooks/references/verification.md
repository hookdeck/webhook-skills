# How to Verify PagerDuty Webhook Signatures

## Why Signature Verification Matters

Your webhook endpoint is a public URL that can page humans, open war rooms and
close tickets. PagerDuty: *"It is strongly recommended that webhook consumers
verify these signatures before processing each event."* Without verification,
anyone who learns the URL can forge an incident.

Source: [Verifying Signatures](https://docs.pagerduty.com/developer/verifying-webhook-signatures).

## The Scheme at a Glance

| | |
|---|---|
| Header | `X-PagerDuty-Signature` |
| Present on | **Every** V3 delivery (required, always sent) |
| Algorithm | HMAC-SHA256 |
| Signed content | The **raw request body**, nothing prepended or appended |
| Encoding | Lowercase hexadecimal (Base16) |
| Header format | `v1=<hex>` — **possibly several, comma-separated** |
| Current version | `v1` (the only one) |
| Key | The subscription's `delivery_method.secret`, used as-is as UTF-8 bytes |
| Timestamp / nonce | **None.** No replay window to check. |
| Handshake | **None.** No challenge, echo or confirmation request. |
| Standard Webhooks? | **No.** No `webhook-id` / `webhook-timestamp` / `webhook-signature` headers. |

## How It Works

PagerDuty's own three-step pseudo-algorithm:

**Step 1 — Extract the signature(s) from the request**

- Extract the signature string from the `X-PagerDuty-Signature` header.
- Split on the `,` character.
- Select only signatures which are version `v1` and remove the `v1=` prefix.

**Step 2 — Compute the expected valid signature**

Using the received JSON payload (the entire request body):

- Compute the SHA-256 HMAC using the shared secret as the key.
- Take the Base16 (hexadecimal) encoding of the result.

**Step 3 — Compare the signatures**

*"If at least one of the signatures matches, the webhook should be considered a
trusted and authentic request from PagerDuty."* PagerDuty adds: *"When comparing
signatures, be sure to use a constant-time string comparison to protect against
timing attacks."*

## Why the Header Holds Multiple Signatures

Verbatim from the docs:

```
X-PagerDuty-Signature:
v1=f03de6f61df6e454f3620c4d6aca17ad072d3f8bbb2760eac3b2ad391b5e8073,
v1=130dcacb53a94d983a37cf2acba98e805a1c37185309ba56fdcccbcf00d6dd8b
```

*"(Note that the actual header value is sent as a single string without any new
lines.)"* The docs wrap it for readability only — on the wire it is one line,
and **PagerDuty emits no space after the commas**.

Multiple signatures exist to allow **zero-downtime secret rotation**: while a
rotation is in progress the same body is signed once per active secret and the
digests are concatenated. The practical consequence:

> **A verifier that compares the whole header string, or only the first entry,
> works fine until the day someone rotates the secret — then it rejects
> everything.** Accept a match against *any* `v1=` entry.

## Where the Secret Comes From

When a webhook subscription is **created**, PagerDuty generates a strong unique
secret and returns it in the create-subscription response as
`delivery_method.secret`. It is shown at creation time. It is **not** an API key,
**not** a REST token, and **not** an Events API routing key.

Used as-is as UTF-8 bytes. PagerDuty's own Python sample does
`key.encode("ASCII")` — ASCII is a subset of UTF-8 and PagerDuty's secrets are
ASCII, so `secret.encode()` / `Buffer.from(secret)` is equivalent. Prefer UTF-8.

See [setup.md](setup.md#capture-the-secret-from-the-response).

## Implementation

### No SDK does this for you

PagerDuty's JavaScript client (`@pagerduty/pdjs`) and Python client (`pdpyras`)
are REST API clients with **no webhook-verification helper**. The only official
verifier is in the **Go** client,
[`webhookv3/webhookv3.go`](https://github.com/PagerDuty/go-pagerduty/blob/master/webhookv3/webhookv3.go)
(with a [sample webhook server](https://github.com/PagerDuty/go-pagerduty/blob/master/examples/webhooks/webhook_server.go)).
That file is the authoritative reference for exact behaviour, so the Node and
Python implementations below mirror it rather than the docs' simplified samples.

What the Go client actually does, and why it matters:

| Behaviour | Why |
|---|---|
| Constants `webhookSignaturePrefix = "v1="`, `webhookSignatureHeader = "X-PagerDuty-Signature"` | Canonical names |
| Splits the header on `","` with **no whitespace trimming**, requires the literal `v1=` prefix | PagerDuty emits no space after commas. Trimming defensively is harmless; **depending** on a space is wrong |
| Entries without the `v1=` prefix are **skipped**, not fatal | How a future `v2=` rolls out without breaking receivers |
| Hex-**decodes** each candidate and compares raw bytes with `hmac.Equal` | Case-insensitive, and an invalid-hex candidate is skipped rather than fatal |
| Distinguishes **"malformed header"** (absent or no parseable `v1=` entries) from **"no valid signatures"** | Recommends HTTP **400** for the former, HTTP **403** for the latter |
| Returns a distinct **"malformed body"** error for an empty body | Recommends HTTP **400** |
| Caps the body read at **2 MB** | PagerDuty itself drops anything over 256 KB, so a 256 KB–2 MB cap is reasonable. **Never below 256 KB** |

### Node.js / JavaScript (manual HMAC)

```javascript
const crypto = require('crypto');

const SIGNATURE_HEADER = 'x-pagerduty-signature'; // Node lowercases header names
const SIGNATURE_PREFIX = 'v1=';

/**
 * @param {Buffer|string} rawBody  RAW, unparsed request body
 * @param {string|undefined} signatureHeader  X-PagerDuty-Signature value
 * @param {string|undefined} secret  delivery_method.secret
 * @returns {boolean}
 */
function verifyPagerDutySignature(rawBody, signatureHeader, secret) {
  // Fail closed: a missing header or an unconfigured secret is a rejection.
  if (!signatureHeader || !secret) return false;

  const body = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');

  // HMAC-SHA256 over the RAW BODY BYTES, keyed with the secret as UTF-8.
  // .digest() with no argument returns the raw 32 bytes, which is what we
  // compare against each hex-decoded candidate (mirrors the Go client).
  const expected = crypto.createHmac('sha256', secret).update(body).digest();

  // The header may carry SEVERAL comma-separated signatures during a secret
  // rotation. Accept a match against ANY v1= entry.
  return signatureHeader.split(',').some((entry) => {
    const part = entry.trim(); // defensive: PagerDuty sends no space after commas
    if (!part.startsWith(SIGNATURE_PREFIX)) return false; // IGNORE unknown versions
    // Buffer.from(..., 'hex') stops at the first invalid pair, so garbage
    // produces a short buffer and the length guard below rejects it.
    const candidate = Buffer.from(part.slice(SIGNATURE_PREFIX.length), 'hex');
    // Length FIRST — crypto.timingSafeEqual THROWS on mismatched lengths, and
    // an uncaught throw becomes a 500 that PagerDuty retries for 48 hours.
    return (
      candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected)
    );
  });
}
```

### Python (manual HMAC)

```python
import hashlib
import hmac
from typing import Optional

SIGNATURE_HEADER = "x-pagerduty-signature"
SIGNATURE_PREFIX = "v1="


def verify_pagerduty_signature(
    raw_body: bytes,
    signature_header: Optional[str],
    secret: Optional[str],
) -> bool:
    """Verify X-PagerDuty-Signature over the raw body."""
    # Fail closed: a missing header or an unconfigured secret is a rejection.
    if not signature_header or not secret:
        return False

    # HMAC-SHA256 over the RAW BODY BYTES, keyed with the secret as UTF-8.
    expected = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()
    expected_bytes = expected.encode("ascii")

    # The header may carry SEVERAL comma-separated signatures during a secret
    # rotation. Accept a match against ANY v1= entry.
    matched = False
    for entry in signature_header.split(","):
        part = entry.strip()  # defensive: PagerDuty sends no space after commas
        if not part.startswith(SIGNATURE_PREFIX):
            continue  # IGNORE unknown versions rather than failing
        candidate = part[len(SIGNATURE_PREFIX):].lower()
        # compare_digest on BYTES. Two str arguments raise TypeError on
        # non-ASCII input, and a forged header can carry anything. Starlette
        # decodes headers as latin-1, so a junk byte would otherwise turn a
        # 403 into an unhandled 500.
        #
        # Do NOT `break` on the first match: finishing the loop keeps the work
        # independent of which entry matched.
        if hmac.compare_digest(candidate.encode("utf-8"), expected_bytes):
            matched = True
    return matched
```

> **Note on PagerDuty's own Python sample.** The docs' sample compares
> `version + "=" + signature` against each raw header element with
> `hmac.compare_digest` on `str` values, and takes `payload.encode()` of a
> *string* payload. That works for the happy path but (a) raises `TypeError` if
> a forged header carries non-ASCII, (b) depends on there being no whitespace
> around the commas, and (c) encourages passing a decoded string rather than the
> raw bytes. The version above is equivalent on valid input and safe on invalid
> input.

### Raw body per framework

| Framework | How to get the raw body |
|---|---|
| Express | `app.post('/webhooks/pagerduty', express.raw({ type: 'application/json' }), handler)` — and **never** mount `express.json()` ahead of it |
| Next.js App Router | `const rawBody = await request.text()` before any `request.json()` |
| FastAPI | `raw_body = await request.body()` before any `await request.json()` |

PagerDuty, verbatim: *"Verifying PagerDuty webhook signatures requires the
unaltered raw body of the request sent to you. Ensure that any frameworks or
middleware you are using have not manipulated or formatted the request body."*

And: *"PagerDuty webhook payloads support unicode characters. If your
implementation is converting the request body from string to bytes [or
vice-versa], ensure that you are using the proper UTF-8 character encoding."*
Incident titles routinely contain non-ASCII — a latin-1 round trip silently
changes the bytes and the digest never matches.

## Status Codes and Retries

PagerDuty retries 5xx, 429 and timeouts **for up to 48 hours**, and treats any
other 4xx as **permanent**. So:

| Situation | Status | Why |
|---|---|---|
| Verified and accepted | **202 Accepted** | PagerDuty's own recommendation; respond inside the 5-second budget and process asynchronously |
| `X-PagerDuty-Signature` missing, or no parseable `v1=` entry | **400** | Mirrors the Go client's `ErrMalformedHeader` guidance; permanent, no retry |
| Empty body | **400** | Mirrors `ErrMalformedBody` |
| Signature mismatch | **403** | Mirrors `ErrNoValidSignatures` guidance. 401 is equally acceptable — both are permanent 4xx |
| Verified body is not valid JSON | **400** | Permanent; retrying won't fix it |
| `PAGERDUTY_WEBHOOK_SECRET` unset | **500** | **Your** misconfiguration, and 5xx gets retried — so the event isn't lost while you fix it. Never "skip verification" |
| Your own processing failed after you already responded 202 | n/a | You've acknowledged; handle it in your queue, don't rely on PagerDuty retries |

Returning **5xx for a bad signature is the expensive mistake**: PagerDuty will
re-send the forged request for two days, and after **3 consecutive dropped**
webhooks it disables the subscription for 24 hours.

## There Is No Replay Window

No timestamp and no nonce appear in `X-PagerDuty-Signature` or in the signed
content. There is nothing to build a tolerance check from.

- **Do not** add a stale-time or clock-skew check. You would be parsing a field
  that does not exist, and you would reject every delivery.
- Replay protection is **de-duplication on the `X-Webhook-Id` header** — unique
  per webhook, repeated across delivery attempts. Retain seen ids for at least
  48 hours (the retry window).
- A byte-for-byte replay of a captured request carries a genuinely valid
  signature. Only de-duplication catches it.

## There Is No Handshake

No challenge request, no echo, no `X-Hook-Secret`-style exchange, no
subscription-confirmation POST. The secret arrives in the create-subscription
**API response**, not over the wire. Nothing hits your endpoint until a real
event fires. Don't write a branch for a validation request.

## Other Security Layers

Only the signature protects **payload integrity**. These are defence in depth.

### Mutual TLS

PagerDuty's own recommendation
([docs](https://docs.pagerduty.com/developer/mutual-tls)). PagerDuty sends a
client TLS certificate with webhooks on request. Five steps:

1. Download the PEM of the DigiCert root from PagerDuty's
   [Public Certificates page](https://docs.pagerduty.com/developer/webhook-tls-certificates).
2. Turn on client certificate verification.
3. Specify that CA certificate as trusted.
4. **Set verification depth to 2** — PagerDuty's certificate is signed by an
   intermediate ("DigiCert Global G2 TLS RSA SHA256 2020 CA1").
5. Check the client certificate's Subject CN:
   - US region: `webhooks.pagerduty.com`
   - EU region: `webhooks.eu.pagerduty.com`

The current root is **DigiCert Global Root G2** (valid until January 2038).
PagerDuty rotates its **client** certificates **yearly**, so
**pin the root, not the leaf** — PagerDuty: *"Customers choosing to rely on the
PagerDuty client certificate are responsible for rotating to the new
certificates at the appropriate time in order to avoid interrupted
connectivity."*

**nginx:**

```nginx
server {
    listen 443 ssl default_server;
    # ... existing SSL configuration for server authentication ...

    ssl_verify_client on;
    ssl_client_certificate /path/to/DigiCert_Global_Root_CA.pem;
    ssl_verify_depth 2;

    location / {
        if ($ssl_client_s_dn !~ "CN=webhooks.pagerduty.com") {
            return 403;
        }

        # ... existing location configuration ...
    }
}
```

**Apache:**

```apache
Listen 443
<VirtualHost *:443>
    # ... existing SSL configuration for server authentication ...

    SSLVerifyClient require
    SSLCACertificateFile "/path/to/DigiCert_Global_Root_CA.pem"
    SSLVerifyDepth 2
</VirtualHost>

<Directory /var/www/>
    Require expr "%{SSL_CLIENT_S_DN_CN} == 'webhooks.pagerduty.com'"

    # ... existing directory configuration ...
</Directory>
```

(Both snippets are PagerDuty's own, verbatim. Note the filename in them says
`DigiCert_Global_Root_CA.pem` — point it at whichever root PEM you downloaded
from PagerDuty's Public Certificates page; the current one is **DigiCert Global
Root G2**.)

This is server config, not application code — which is why the examples in this
skill do app-level HMAC only.

### PagerDuty verifies *your* server certificate too

- It must chain to a CA in
  [Mozilla's included-CA list](https://wiki.mozilla.org/CA/Included_Certificates).
  **Self-signed certificates are dropped.**
- The chain must be presented **in order**. *"Out of order chains will be
  rejected and result in dropped webhooks."*
- PagerDuty's webhook delivery system supports **TLS v1.2 only**.

An **expired** server certificate is a *temporary* error (retried); other TLS
errors are *permanent* (dropped without retry).

### OAuth 2.0 client credentials

A subscription can be associated with an OAuth client so deliveries carry a
bearer token. Retry nuances: an invalid or deleted OAuth client is a
**temporary** error; a 401 makes PagerDuty refresh the token and retry
immediately; a **second 401 after a successful refresh is permanent** and the
webhook is dropped. Verify the signature regardless.

### IP safelists

PagerDuty publishes per-region webhook egress IPs. They are **shared across all
customers** and **subject to change** — fetch them at runtime rather than
hardcoding:

- US: <https://docs.pagerduty.com/ip-safelists/webhooks-us-service-region>
  ([JSON](https://docs.pagerduty.com/ip-safelists/webhooks-us-service-region-json))
- EU: <https://docs.pagerduty.com/ip-safelists/webhooks-eu-service-region>
  ([JSON](https://docs.pagerduty.com/ip-safelists/webhooks-eu-service-region-json))

These are the **webhook + workflow-action** egress IPs and are **different from
the [REST API IPs](https://docs.pagerduty.com/developer/rest-api-ips)**.

### Basic auth in the URL

`https://username:password@app.example.com` is supported; special characters
such as `@` must be percent-encoded. Mentioned, not recommended — credentials
in a URL leak into logs.

### `custom_headers`

Delivered **verbatim** to your endpoint (redacted in GET API responses, not on
delivery). A static shared-secret header is possible but is **not a substitute
for the signature**.

## Common Signature Verification Errors

### "Signature always fails, even on obviously genuine deliveries"

**Body was re-serialised.** The single most common cause. `express.json()`
mounted before the route, `await request.json()` called before
`await request.text()`, a proxy that pretty-prints JSON, or
`json.dumps(json.loads(body))`. Hash the exact bytes you received.

### "It worked, then every delivery started failing at once"

**A secret rotation started and your verifier only checks one signature.** Split
the header on `,` and accept any matching `v1=` entry.

### "500 / RangeError instead of a rejection"

**`crypto.timingSafeEqual` threw on a length mismatch.** Compare lengths first.
In Python, `hmac.compare_digest` tolerates unequal lengths but raises
`TypeError` on `str` arguments containing non-ASCII — encode both sides to bytes.

### "Works locally, fails in production"

- A proxy or CDN rewrote the body (charset normalisation, gzip, JSON minifying).
- A body-size cap below **256 KB** truncated a large incident payload. Set any
  cap to **at least 256 KB**; PagerDuty drops anything above 256 KB itself.
- The wrong secret: an API token or Events API routing key instead of
  `delivery_method.secret`.
- EU vs US account mismatch — different subscription, different secret.

### "Unicode incident titles fail"

**Latin-1 decoding somewhere.** Keep the body as bytes end to end, or decode as
UTF-8 explicitly.

### "Some event types blow up the handler"

- `event.agent` and `event.client` can be **`null`** (the documented
  `service.updated` example has both). Guard before `event.agent.id`.
- `data.priority` can be `null` when no priority is set.
- An unknown `event_type` must hit a default branch — PagerDuty adds event types
  over time and ships unannounced Early Access events.

## How to Debug Verification Failures

1. **Log the header and the computed digest side by side** (never the secret):

   ```javascript
   console.log('received:', signatureHeader);
   console.log('computed: v1=' + crypto.createHmac('sha256', secret).update(rawBody).digest('hex'));
   ```

2. **Log `rawBody.length` and the first/last 32 bytes.** If the length differs
   between what the tunnel shows and what your handler sees, middleware is
   touching the body.

3. **Replay the exact bytes.** Capture a real delivery with
   `npx hookdeck-cli listen 3000 pagerduty --path /webhooks/pagerduty`, copy the
   raw body byte for byte, and re-send it with `curl --data-binary @body.json`
   plus the original `X-PagerDuty-Signature`. If that passes and live traffic
   fails, the difference is in transit, not in your HMAC.

4. **Check you have an entry at all.** Count the `v1=` entries in the header.
   Zero parseable entries is a malformed header (400), not a mismatch (403).

5. **Cross-check against the Go client.** `go-pagerduty`'s
   [sample webhook server](https://github.com/PagerDuty/go-pagerduty/blob/master/examples/webhooks/webhook_server.go)
   is PagerDuty's own reference receiver. If it accepts a payload your code
   rejects, the difference is in your code.
