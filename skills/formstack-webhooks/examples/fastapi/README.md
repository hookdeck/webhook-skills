# Formstack Webhooks - FastAPI Example

Minimal example of receiving a **Formstack Forms** WebHook submit action in FastAPI,
verifying the `X-FS-Signature` HMAC header.

> **Formstack Forms only.** Not Formstack Documents (formerly WebMerge — separate "Webhook
> Delivery" feature, different payload), not Formstack Sign.
>
> **Not FastSpring.** FastSpring is an unrelated e-commerce company that uses the *same*
> `X-FS-Signature` header name with a **base64** digest and an `events[]` envelope.
> Formstack uses **lowercase hex** and has no envelope.

## Prerequisites

- Python 3.9+
- A Formstack Forms account with edit access to the form
- An **HMAC Key** set on the form's WebHook — without one Formstack sends **no signature at
  all**

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python3 -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your WebHook's **HMAC Key** to `.env` as `FORMSTACK_HMAC_KEY`.

   Find it in Formstack: **Form Settings → Emails & Actions → Advance Settings → Add
   Webhook** (or edit an existing one), in the **HMAC Key** field. It's `hmacSecret` on the
   v2025 API object.

   It is **not** the API client secret, access token, or Personal Access Token. There is no
   account-wide webhook secret — each WebHook on each form can have its own key.

4. Only if the WebHook's **"Custom HMAC Header"** field is filled in, set
   `FORMSTACK_SIGNATURE_HEADER` to that header name (lowercased). Otherwise leave the
   default, `x-fs-signature`.

## Run

```bash
python main.py
```

Or with uvicorn directly:

```bash
uvicorn main:app --reload --port 8000
```

Server runs on `http://localhost:8000`.

Webhook endpoint: `POST http://localhost:8000/webhooks/formstack`

## Test

```bash
pytest test_webhook.py -v
```

The suite covers both content types, the `sha256=` prefix, uppercase hex, the custom header
override, fail-closed behaviour when no key is configured, non-ASCII header values, and —
most importantly — that a digest computed over a **re-encoded** urlencoded body is rejected.

### Send a signed request by hand

The signature covers the raw body only, so you can sign locally. Note `printf`, not `echo`
— a trailing newline changes the digest:

```bash
BODY='FormID=1234567&UniqueID=9876543210&Name=Jane+Smith&Email=jane%40example.com'
KEY='your_webhook_hmac_key'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha256 -hmac "$KEY" -r | cut -d' ' -f1)

curl -X POST http://localhost:8000/webhooks/formstack \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -H "X-FS-Signature: $SIG" \
  -d "$BODY"
```

### Receive real submissions locally

```bash
npx hookdeck-cli listen 8000 formstack --path /webhooks/formstack
```

No account, no install required — the CLI creates a guest account and gives you a public
HTTPS URL plus a web UI for inspecting requests. Paste the printed URL into the WebHook's
**URL Address** field, set the **HMAC Key**, then submit the form.

## There Are No Event Types

A Formstack WebHook fires on exactly one thing: **a form submission**. There is no
event-type header, no event-type body field, and no event names — `form.submitted`,
`submission.created` and `form_submission` **do not exist**.

This handler dispatches on **`FormID`** via the `FORM_HANDLERS` dict in `main.py`, with a
default branch that logs and returns 200 for unrecognised forms. Add your own form IDs
there.

The only filtering that exists is **Routing Logic**, a sender-side conditional filter on the
submitted answers that decides whether a submission is sent at all. Your handler never sees
it.

## Payload Shape Is Per-Form

The body is a **flat map of field key → value**, and the keys are **the form's own field
labels** (or numeric IDs, depending on the WebHook's `postDataFieldKeys` setting). There is
no fixed schema — read every key with `.get()` and tolerate absence.

To learn exactly what a given form will send:

```
GET https://www.formstack.com/api/v2025/forms/{formId}/webhooks/openapi
```

The API reference's example schema shows `FormID` and `UniqueID` (both strings) alongside
the form's field keys, and real deliveries confirm both. When the WebHook has a Shared
Secret, a `HandshakeKey` field carrying it follows them. There is no `Timestamp`, `FormName`
or `SubmissionID`.

> **Duplicate labels collapse.** With `field_names` (default) or
> `api_friendly_field_names`, if two fields share a label only the **last** occurrence is
> sent. Use `field_ids` when labels may repeat.

## FastAPI Notes

- `await request.body()` reads the **raw bytes** before anything parses them. Do **not**
  call `await request.form()` before verifying — the digest covers the raw urlencoded
  bytes, not a re-encoded form of the parsed dict.
- The handler takes `Request` directly rather than a Pydantic model, because the payload
  schema is per-form and cannot be declared in advance.
- Parsing happens after verification, branching on `Content-Type`:
  `urllib.parse.parse_qsl` for urlencoded (the default), `json.loads` for JSON.
  `keep_blank_values=True` keeps unanswered optional fields.
- `BackgroundTasks` acknowledges immediately and processes afterwards.

## Security

- HMAC-SHA256 over the **raw body**, **lowercase hex**, keyed with the WebHook's HMAC Key
- An optional `sha256=` prefix is stripped case-insensitively; the digest is compared with
  `hmac.compare_digest` on **bytes** (not `str`, which raises `TypeError` on non-ASCII input
  — header values arrive latin-1 decoded, so a hostile header would otherwise become a 500)
- The signature header name comes from `FORMSTACK_SIGNATURE_HEADER`, defaulting to
  `x-fs-signature`, because the WebHook's "Custom HMAC Header" field can override it
- **Fails closed**: an unset or empty `FORMSTACK_HMAC_KEY` returns `500` — it never falls
  through to accepting unverified requests
- Returns `400` on a missing header, an invalid signature, or an unparseable/unsupported body
- **No replay protection exists.** Nothing but the body is signed — no timestamp, no nonce —
  so a captured delivery replays indefinitely. The handler derives an idempotency key from
  `UniqueID`, falling back to a SHA-256 of the raw body. Serve this endpoint over HTTPS only
- Formstack's published source IPs (`52.71.30.102`, `3.227.148.190`, `44.196.66.47`,
  `54.69.216.81`, `52.37.95.20`, `52.24.103.36`) are a **firewall aid** Formstack can change
  without notice — never a substitute for the HMAC

### Sourcing note

Formstack's current public documentation states the header name and the "HMAC Key" field but
**never names the algorithm or the encoding**. HMAC-SHA256, lowercase hex, `sha256=`-prefixed
is confirmed by two real deliveries captured on 2026-09-25. The test suite verifies both of
them, with the signatures Formstack produced, so the verifier is checked against Formstack
itself and not only against digests the tests computed.
