# Postmark Webhooks - Express Example

Minimal example of receiving Postmark webhooks with authentication in Express.js.

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
   cp .env.example .env
   ```

3. Generate a secure webhook token:
   ```bash
   openssl rand -base64 32
   ```

4. Add the token to your `.env` file

## Run

Start the server:

```bash
npm start
```

Server runs on http://localhost:3000

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

## Authentication Methods

This example uses token-based authentication. For basic auth, configure your webhook URL as:

```
https://username:password@yourdomain.com/webhooks/postmark
```

And update the handler to validate basic auth headers instead of the token parameter.