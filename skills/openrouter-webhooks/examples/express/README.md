# OpenRouter Webhooks - Express Example

Minimal example of receiving OpenRouter video-generation callbacks (`callback_url`) with signature verification. OpenRouter has no webhook verification SDK, so the HMAC check is manual.

## Prerequisites

- Node.js 20+
- OpenRouter workspace with a webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your OpenRouter webhook signing secret to `.env` as `OPENROUTER_WEBHOOK_SECRET`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Run the tests

```bash
npm test
```

The tests sign payloads with the real OpenRouter algorithm (HMAC-SHA256 of `"<t>,<raw body>"`) and cover valid, invalid, tampered, replayed and opt-in-tolerance requests.

### Send a signed test event

```bash
node -e '
const c = require("crypto");
const body = JSON.stringify({ type: "video.generation.completed", created_at: new Date().toISOString(), data: { id: "job_test", status: "completed", unsigned_urls: ["https://example.com/video.mp4"] } });
const t = Math.floor(Date.now() / 1000);
const v1 = c.createHmac("sha256", process.env.OPENROUTER_WEBHOOK_SECRET).update(`${t},${body}`).digest("hex");
fetch("http://localhost:3000/webhooks/openrouter", { method: "POST", headers: { "Content-Type": "application/json", "X-OpenRouter-Signature": `t=${t},v1=${v1}` }, body }).then((r) => console.log(r.status));
'
```

A valid event returns `204`; a wrong secret or signature returns `401`.

### Receive real callbacks locally

```bash
npx hookdeck-cli listen 3000 openrouter --path /webhooks/openrouter
```

Use the public URL the CLI prints as the `callback_url` of a `POST /api/v1/videos` request (this spends credits).

## Endpoint

- `POST /webhooks/openrouter` - Receives and verifies OpenRouter video-generation callbacks (204 / 401)
- `GET /health` - Health check
