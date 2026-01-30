# Hookdeck Event Gateway - Express Example

Minimal example of receiving webhooks through Hookdeck with signature verification.

## Prerequisites

- Node.js 18+
- Hookdeck account with destination configured
- Hookdeck webhook secret from destination settings

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Hookdeck webhook secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Login and start listening
hookdeck login
hookdeck listen 3000 --path /webhooks
```

Then send test events from the Hookdeck Dashboard or configure a source to send webhooks.

## Endpoint

- `POST /webhooks` - Receives and verifies Hookdeck webhook events
