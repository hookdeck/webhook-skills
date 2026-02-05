# GitLab Webhooks - Next.js Example

Minimal example of receiving GitLab webhooks with token verification in Next.js App Router.

## Prerequisites

- Node.js 18+
- GitLab project with webhook access
- Secret token for webhook verification

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Generate a secret token:
   ```bash
   openssl rand -hex 32
   ```

4. Add the token to both:
   - Your `.env.local` file as `GITLAB_WEBHOOK_TOKEN`
   - GitLab webhook settings as the "Secret token"

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
   hookdeck listen 3000 --path /webhooks/gitlab
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

Set the `GITLAB_WEBHOOK_TOKEN` environment variable in your Vercel project settings.

## Security

- Token verification uses timing-safe comparison
- Returns 401 for invalid tokens
- Logs all received events
- No sensitive data logged
- Uses TypeScript for type safety