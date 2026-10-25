# Meilisearch Webhooks - FastAPI Example

Minimal example of receiving Meilisearch task webhooks with FastAPI and authenticating them
with the `Authorization` header.

Meilisearch does not sign payloads. The only credential is the `Authorization` header you
configure, sent verbatim. The handler compares the **whole header value**, including any
`Bearer ` or `Basic ` prefix, in constant time, then gunzips the body and parses it as ndjson
(one finished task object per line).

## Prerequisites

- Python 3.9+
- A Meilisearch Cloud project (Project Settings > Webhooks) or a self-hosted instance started
  with `--task-webhook-url` and `--task-webhook-authorization-header`

## Setup

1. Install dependencies:
   ```bash
   python3 -m venv venv && source venv/bin/activate
   pip install -r requirements.txt
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `MEILISEARCH_AUTHORIZATION` to the Authorization header value exactly as set in
   Meilisearch, including any `Bearer ` or `Basic ` prefix.

## Run

```bash
uvicorn main:app --port 8000
```

Server runs on http://localhost:8000 and accepts webhooks at `POST /webhooks/meilisearch`.

## Test

```bash
pytest test_webhook.py -v
```

The tests send gzipped multi-line ndjson bodies with correct, wrong and missing
`Authorization` headers.

## Receive Meilisearch Webhooks Locally

```bash
npx hookdeck-cli listen 8000 meilisearch --path /webhooks/meilisearch
```

Use the printed URL as the webhook URL in Meilisearch. Hookdeck stores gzip bodies as binary,
so events show a binary body in the dashboard; it forwards the original bytes and the
`Content-Encoding` header.

## How It Works

- `main.py`: `verify_meilisearch_request()`, `parse_tasks()`, the `require_meilisearch_auth`
  dependency and the `POST /webhooks/meilisearch` route

1. The `require_meilisearch_auth` dependency compares `Authorization` with
   `MEILISEARCH_AUTHORIZATION` before the body is read. Failure returns `401`.
2. The raw bytes are read with `await request.body()`.
3. When `Content-Encoding` is gzip the body is decompressed (`gzip.decompress`); an
   undecodable body returns `400`.
4. The text is split on newlines and each non-empty line is `json.loads`ed. A bad line returns `400`.
5. Each task is handled by `type` and `status`, then `{"received": true}` is returned.
