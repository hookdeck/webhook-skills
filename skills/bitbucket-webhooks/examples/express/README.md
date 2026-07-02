# Bitbucket Webhooks - Express Example

Minimal example of receiving Bitbucket Cloud webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Bitbucket repository with a webhook configured (with a secret)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Bitbucket webhook secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Forward webhooks to localhost
npx hookdeck-cli listen 3000 bitbucket --path /webhooks/bitbucket
```

Then configure the Hookdeck URL in your Bitbucket repository webhook settings.

### Trigger Test Events

- Push commits to your repository (`repo:push`)
- Open, update, merge, or decline a pull request (`pullrequest:*`)
- Use **View requests** → **Redeliver** on the webhook in Bitbucket to resend a payload

### Run the tests

```bash
npm test
```

## Endpoint

- `POST /webhooks/bitbucket` - Receives and verifies Bitbucket webhook events
