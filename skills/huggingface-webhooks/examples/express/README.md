# Hugging Face Webhooks - Express Example

Minimal example of receiving Hugging Face webhooks with `X-Webhook-Secret` verification in Express.js.

## Prerequisites

- Node.js 18+
- A Hugging Face account with permission to add webhooks
- A secret value to authenticate incoming requests

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret:
   ```bash
   openssl rand -hex 32
   ```

4. Use the same value in both:
   - Your `.env` file as `HUGGINGFACE_WEBHOOK_SECRET`
   - The **Secret** field in [Hugging Face Webhook Settings](https://huggingface.co/settings/webhooks)

## Run

```bash
npm start
```

Server runs on `http://localhost:3000`.

Webhook endpoint: `POST http://localhost:3000/webhooks/huggingface`

The handler also accepts the secret as a `?secret=...` query parameter, so this also works:

```
POST http://localhost:3000/webhooks/huggingface?secret=...
```

## Test

Run the test suite:
```bash
npm test
```

To deliver real Hugging Face webhooks to your local server:

1. Use the [Hookdeck CLI](https://hookdeck.com/docs/cli) (no account needed):
   ```bash
   npx hookdeck-cli listen 3000 huggingface --path /webhooks/huggingface
   ```

2. Paste the printed public URL into the **Target URL** field in Hugging Face webhook settings.

3. Use **Activity → Replay** in the Hugging Face webhook settings to re-deliver past events.

## Events Handled

This example handles all current Hugging Face webhook scopes:

- `repo` (create / update / delete / move)
- `repo.content` (update — new commits / branches / tags)
- `repo.config` (update — settings, privacy)
- `discussion` (create / update / delete — including Pull Requests)
- `discussion.comment` (create / update)

Unknown narrowed scopes are treated as an `update` on the broader scope for forward-compatibility.

## Security

- `X-Webhook-Secret` (or `?secret=` query param) verified with `crypto.timingSafeEqual`
- Returns 401 on missing / invalid secret
- HTTPS recommended in production (the secret travels in cleartext)
