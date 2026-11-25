# Worldline Webhooks - Next.js Example

Minimal Next.js example of receiving Worldline Connect and Worldline Direct webhooks: answer the Connect `X-GCS-Webhooks-Endpoint-Verification` GET, verify `X-GCS-Signature` (base64 HMAC-SHA256 of the raw body) with the secret looked up by `X-GCS-KeyId`, dedupe on the event `id`, and respond before processing.

## Prerequisites

- Node.js 20+
- A Worldline **webhooks key** (key id + secret key). Connect: Configuration Center → webhooks keys. Direct: Merchant Portal → Developer → Webhooks. See [setup](../../references/setup.md)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. In `.env`, set:
   - `WORLDLINE_WEBHOOK_KEY_ID` and `WORLDLINE_WEBHOOK_SECRET`: your webhooks key id and secret key. **Not** the REST API key.
   - `WORLDLINE_WEBHOOK_KEY_ID_PREVIOUS` / `WORLDLINE_WEBHOOK_SECRET_PREVIOUS`: optional, the older key while rotating.
   - `WORLDLINE_CUSTOM_HEADER_NAME` / `WORLDLINE_CUSTOM_HEADER_VALUE`: optional Connect "webhooks header", checked in addition to the HMAC.

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000. Endpoint: `GET` and `POST /webhooks/worldline` in [app/webhooks/worldline/route.ts](app/webhooks/worldline/route.ts).

## Test

```bash
npm test
```

The tests sign payloads with base64 HMAC-SHA256 and cover: a valid signature; a pretty-printed body verified on its raw bytes; all 57 Connect events and all 20 Direct events; the older key during rotation; an unknown `X-GCS-KeyId` (401 even when the signature matches a configured secret); missing headers, tampered bodies and malformed signatures (401, never 500); a missing secret (401); a correctly signed empty body and invalid JSON (400); a one-element array; `apiVersion: "v2"` (accepted); dedupe on `id` across `retry-count` values; `TEST`-prefixed ids (acknowledged, not processed); unknown types (200); the optional custom header; the GET handshake echo; and the `paymentlink.*` → `paymentLink` key mapping.

## Receive real webhooks locally

```bash
npx hookdeck-cli listen 3000 worldline --path /webhooks/worldline
```

Register the printed URL as an endpoint. On Connect, add it on the merchant's webhooks page; the verification GET fires immediately, then use Actions → Test. On Direct, add it in the Merchant Portal or send it to `SendTestWebhook`.

## Notes

- **Raw body.** The route reads `await request.text()`, never `request.json()`. The HMAC covers the exact bytes Worldline sent, so never verify a re-serialised object.
- **Key lookup.** The secret is chosen by `X-GCS-KeyId`. An unknown key id gets `401`; there is no fallback to "the one secret". Connect signs with the **oldest** key, so keep the old pair in `*_PREVIOUS` while rotating.
- **GET handshake.** The unsigned GET is answered without a signature check on purpose. It carries no payload and changes nothing, and Connect needs it to activate the endpoint. Direct doesn't send it, and answering it there is harmless.
- **No replay window.** Worldline sends no timestamp. Dedupe on the event `id`. The in-memory set is for the demo; use a unique constraint in your database.
- **Respond first.** Connect times out at 10 seconds and treats 3xx as failure. The route returns 200 and runs processing in `after()`. The shared logic lives in [lib/worldline.ts](lib/worldline.ts).
- **Don't log raw bodies.** They carry masked PANs, 3-D Secure data and fraud results.
