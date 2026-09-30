# GitLab Webhooks - Next.js Example

Minimal example of receiving GitLab webhooks with signature verification in Next.js App Router.

## Prerequisites

- Node.js 18+
- GitLab project with webhook access
- A GitLab signing token (GitLab 19.0+), or a legacy secret token

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. In GitLab (Settings > Webhooks), select **Generate signing token** and copy it
   (it is shown once and starts with `whsec_`). Add it to your `.env.local` file as
   `GITLAB_WEBHOOK_SIGNING_TOKEN`. GitLab then signs each request with a Standard
   Webhooks HMAC-SHA256 signature in the `webhook-signature` header.

4. Optional, legacy: if the webhook also uses a **Secret token** (sent as plain
   text in `X-Gitlab-Token`), add the same value as `GITLAB_WEBHOOK_TOKEN`. The
   example checks the signature when `webhook-signature` is present and falls back
   to the secret token otherwise, as GitLab recommends while migrating.

## Run

### Development
```bash
npm run dev
```

### Production
```bash
npm run build
npm start
```

Server runs on http://localhost:3000

Webhook endpoint: `POST http://localhost:3000/webhooks/gitlab`

## Test

Run the test suite:
```bash
npm test
```

To test with real GitLab webhooks:

1. Use [Hookdeck CLI](https://hookdeck.com/docs/cli) for local testing:
   ```bash
   npx hookdeck-cli listen 3000 gitlab --path /webhooks/gitlab
   ```

2. Or use GitLab's test feature:
   - Go to your GitLab project → Settings → Webhooks
   - Find your webhook and click "Test"
   - Select an event type to send

## Events Handled

This example handles:
- Push events
- Merge request events
- Issue events
- Pipeline events
- Tag push events
- Release events

Add more event handlers as needed in `app/webhooks/gitlab/route.ts`.

## Deployment

This example is ready for deployment to Vercel:

```bash
npx vercel
```

Set `GITLAB_WEBHOOK_SIGNING_TOKEN` (and `GITLAB_WEBHOOK_TOKEN` if you still use the legacy secret token) in your Vercel project settings.

## Security

- Verifies the `webhook-signature` HMAC-SHA256 over the raw body, with a
  timing-safe comparison and a 5-minute `webhook-timestamp` window
- Legacy `X-Gitlab-Token` comparison is also timing-safe
- Returns 401 for invalid signatures or tokens
- Logs all received events
- No sensitive data logged
- Uses TypeScript for type safety