# BaseLinker Webhooks - FastAPI Example

Receiving BaseLinker (Base.com) webhooks in FastAPI.

> **This is not a normal webhook handler.** BaseLinker only ever sends HTTP
> **HEAD** requests, so there is **no body** — the entire payload is in the
> **query string** — and there is **no signature to verify** (no HMAC, no
> signature header, no secret, no handshake). The response must be a bare,
> bodyless `200`. See the skill's `references/verification.md`.

## What this example shows

- `@app.head("/webhooks/baselinker")` — not `@app.post`, and with **no request
  body model**. There is no body to parse.
- Reading the payload from **typed query arguments** (`request.query_params`
  works too), annotated `str` rather than `int` on purpose: an `int` annotation
  makes FastAPI answer a non-numeric value with a `422` whose body is JSON, and a
  HEAD response must not carry a body. `order_id` is coerced with `int()` and
  validated instead — query values are always strings.
- Returning `Response(status_code=200)` with no content
  ([RFC 9110 §9.3.2](https://www.rfc-editor.org/rfc/rfc9110#section-9.3.2)).
  Error responses use `Response(status_code=…)` rather than `HTTPException`,
  which would render a JSON body.
- Fetching the authoritative order from `api.baselinker.com` with the
  `X-BLToken` **request** header.
- An **optional** URL-token check — a token *you* append to the endpoint URL.
  It is **not** a BaseLinker signature.

Observed query params are `order_id` (e.g. `42`) and `state` (e.g. `packed`).
These are **observed examples, not a documented or exhaustive list**, and `state`
is **not** an event-type discriminator.

## Prerequisites

- Python 3.9+
- A BaseLinker / Base.com account. A `BASELINKER_API_TOKEN` is optional — it is
  only used to fetch order detail after a callback.

## Setup

1. Create a virtual environment and install dependencies:
   ```bash
   python -m venv venv
   source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Optionally set `BASELINKER_API_TOKEN` and `BASELINKER_URL_TOKEN`. There is
   **no webhook signing secret to configure** — BaseLinker does not have one.

## Run

```bash
uvicorn main:app --reload --port 8000
```

## Test

```bash
pytest
```

Send a delivery by hand — `curl -I` issues a HEAD request:

```bash
curl -I 'http://localhost:8000/webhooks/baselinker?order_id=42&state=packed&token=YOUR_URL_TOKEN'
```

### Receive webhooks locally

```bash
npx hookdeck-cli listen 8000 baselinker --path /webhooks/baselinker
```

Allow HEAD on the Hookdeck Baselinker Source ([custom methods](https://hookdeck.com/docs/sources#custom-methods)). Since a HEAD
response cannot carry a body, Hookdeck returns the request id in the
`x-hookdeck-request-id` **response header**; use it to correlate a delivery with
its dashboard entry.

## Endpoint

- `HEAD /webhooks/baselinker` — reads `order_id` / `state` from the query string,
  optionally checks the URL token, and returns a bodyless `200` (`400` if
  `order_id` is absent or invalid, `401` if the URL token is configured and does
  not match).
- `GET /health` — health check.
