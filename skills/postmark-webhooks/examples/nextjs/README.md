# Postmark Webhooks - Next.js Example

Minimal example of receiving Postmark webhooks in a Next.js App Router application.

## Prerequisites

- Node.js 18+
- Postmark account with webhook configuration access

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Generate a secure webhook token:
   ```bash
   openssl rand -base64 32
   ```

4. Add the token to your `.env.local` file

## Run

Development mode:

```bash
npm run dev
```

Visit http://localhost:3000

## Configure Postmark

1. Log in to your [Postmark account](https://account.postmarkapp.com)
2. Select your Server → Webhooks → Add webhook
3. Set the webhook URL with your token:
   ```
   https://yourdomain.com/webhooks/postmark?token=your-secret-token
   ```
4. Select the events you want to receive
5. Save and test the webhook

## Test Locally

Use the Hookdeck CLI for local testing:

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 3000 --path /webhooks/postmark
```

Then use the provided URL in Postmark's webhook configuration.

## Test

Run the test suite:

```bash
npm test
```

## Production Deployment

For production, ensure:

1. Environment variable `POSTMARK_WEBHOOK_TOKEN` is set
2. Your domain uses HTTPS
3. Consider implementing rate limiting and IP allowlisting