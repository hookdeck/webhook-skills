# Meilisearch Webhooks - Next.js Example

Minimal example of receiving Meilisearch task webhooks with the Next.js App Router and
authenticating them with the `Authorization` header.

Meilisearch does not sign payloads. The only credential is the `Authorization` header you
configure, sent verbatim. The route compares the **whole header value**, including any
`Bearer ` or `Basic ` prefix, in constant time, then gunzips the body (read with
`request.arrayBuffer()`) and parses it as ndjson (one finished task object per line).

## Prerequisites

- Node.js 18+
- A Meilisearch Cloud project (Project Settings > Webhooks) or a self-hosted instance started
  with `--task-webhook-url` and `--task-webhook-authorization-header`

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Set `MEILISEARCH_AUTHORIZATION` to the Authorization header value exactly as set in
   Meilisearch, including any `Bearer ` or `Basic ` prefix.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/meilisearch`.

## Test

```bash
npm test
```

The tests send gzipped multi-line ndjson bodies with correct, wrong and missing
`Authorization` headers.

## Receive Meilisearch Webhooks Locally

```bash
npx hookdeck-cli listen 3000 meilisearch --path /webhooks/meilisearch
```

Use the printed URL as the webhook URL in Meilisearch. Hookdeck stores gzip bodies as binary,
so events show a binary body in the dashboard; it forwards the original bytes and the
`Content-Encoding` header.

## How It Works

- `lib/verify-meilisearch.ts`: `verifyMeilisearchRequest()` and `parseTasks()`
- `app/webhooks/meilisearch/route.ts`: the `POST` handler

1. `Authorization` is compared with `MEILISEARCH_AUTHORIZATION` before the body is read.
   Failure returns `401`.
2. The raw bytes are read with `request.arrayBuffer()` (not `text()` or `json()`).
3. When `Content-Encoding` is gzip the body is gunzipped; an undecodable body returns `400`.
4. The text is split on newlines and each non-empty line is `JSON.parse`d. A bad line returns `400`.
5. Each task is handled by `type` and `status`, then `{"received": true}` is returned.
