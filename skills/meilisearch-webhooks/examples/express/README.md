# Meilisearch Webhooks - Express Example

Minimal example of receiving Meilisearch task webhooks and authenticating them with the
`Authorization` header.

Meilisearch does not sign payloads. The only credential is the `Authorization` header you
configure, sent verbatim. The handler compares the **whole header value**, including any
`Bearer ` or `Basic ` prefix, in constant time, then gunzips the body and parses it as ndjson
(one finished task object per line).

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
   cp .env.example .env
   ```

3. Set `MEILISEARCH_AUTHORIZATION` to the Authorization header value exactly as set in
   Meilisearch, including any `Bearer ` or `Basic ` prefix.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and accepts webhooks at `POST /webhooks/meilisearch`.

## Test

```bash
npm test
```

The tests send gzipped multi-line ndjson bodies with correct, wrong and missing
`Authorization` headers. To try it by hand:

```bash
printf '{"uid":1,"indexUid":"movies","status":"succeeded","type":"documentAdditionOrUpdate"}\n{"uid":2,"indexUid":"movies","status":"failed","type":"settingsUpdate"}\n' | gzip |
  curl -X POST http://localhost:3000/webhooks/meilisearch \
    -H "Content-Type: application/x-ndjson" \
    -H "Content-Encoding: gzip" \
    -H "Authorization: $MEILISEARCH_AUTHORIZATION" \
    --data-binary @-
```

## Receive Meilisearch Webhooks Locally

```bash
npx hookdeck-cli listen 3000 meilisearch --path /webhooks/meilisearch
```

Use the printed URL as the webhook URL in Meilisearch. Hookdeck stores gzip bodies as binary,
so events show a binary body in the dashboard; it forwards the original bytes and the
`Content-Encoding` header.

## How It Works

- `src/index.js`: `verifyMeilisearchRequest()`, `parseTasks()` and the
  `POST /webhooks/meilisearch` route

1. The body is read raw with `express.raw({ type: '*/*' })`, so any content
   type works. The credential is checked before the body is read, and the gzip bytes are
   left for the handler to gunzip.
2. `Authorization` is compared with `MEILISEARCH_AUTHORIZATION`. Failure returns `401`.
3. When `Content-Encoding` is gzip the body is gunzipped (`zlib.gunzipSync`); an undecodable
   body returns `400`.
4. The text is split on newlines and each non-empty line is `JSON.parse`d (never the whole
   body). A bad line returns `400`.
5. Each task is handled by `type` and `status`, then `200 {"received": true}` is returned.
