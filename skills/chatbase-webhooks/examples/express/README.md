# Chatbase Webhooks - Express Example

Minimal example of receiving Chatbase webhooks with signature verification:

- `POST /webhooks/chatbase` - event webhooks (`leads.submit`, `phone_call.summary`, `{action name}_custom_form.submit`, `{action name}_collect_data.submit`), verified with `x-chatbase-signature` (hex HMAC-SHA1 of the raw body)
- `POST /webhooks/chatbase-hipaa` - HIPAA conversation webhook (`conversation.deleted`), verified with `X-Chatbase-Signature: v1=<hex>` (HMAC-SHA256 of `timestamp.body`) and `X-Chatbase-Timestamp`

## Prerequisites

- Node.js 18+
- A Chatbase AI agent on a paid plan (webhooks need one), and your webhook secret
- For the HIPAA route: a HIPAA-compliant Enterprise workspace and its signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Set `CHATBASE_WEBHOOK_SECRET` (and `CHATBASE_HIPAA_WEBHOOK_SECRET` if you use the HIPAA webhook) in `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 chatbase --path /webhooks/chatbase
```

Paste the printed URL into your Collect Leads Action's **Destinations** section (or **Settings > Webhooks** for custom forms, **Phone > Connections** for call summaries) and click **Create webhook**. Submit a lead in the chat to trigger `leads.submit`.

### Send a signed request by hand

```bash
BODY='{"eventType":"leads.submit","chatbotId":"agent_123","payload":{"conversationId":"conv_1","customerEmail":"example@chatbase.co","customerName":"Example","customerPhone":"123"}}'
SIG=$(printf '%s' "$BODY" | openssl dgst -sha1 -hmac "$CHATBASE_WEBHOOK_SECRET" | sed 's/^.* //')
curl -X POST http://localhost:3000/webhooks/chatbase \
  -H 'Content-Type: application/json' -H "x-chatbase-signature: $SIG" -d "$BODY"
```

HIPAA delivery:

```bash
BODY='{"deliveryId":"d1","event":"conversation.deleted","deletionReason":"idle_24h","conversation":{"id":"c1","chatbotId":"a1","messages":[]}}'
TS=$(date +%s)
SIG="v1=$(printf '%s' "$TS.$BODY" | openssl dgst -sha256 -hmac "$CHATBASE_HIPAA_WEBHOOK_SECRET" | sed 's/^.* //')"
curl -X POST http://localhost:3000/webhooks/chatbase-hipaa \
  -H 'Content-Type: application/json' -H "X-Chatbase-Timestamp: $TS" -H "X-Chatbase-Signature: $SIG" -d "$BODY"
```

### Run tests

```bash
npm test
```

## Files

- `src/index.js` - Express app with both routes; bodies are read with `express.raw({ type: '*/*' })` so verification sees the exact bytes
- `test/webhook.test.js` - Jest + Supertest tests that sign requests the way Chatbase does
