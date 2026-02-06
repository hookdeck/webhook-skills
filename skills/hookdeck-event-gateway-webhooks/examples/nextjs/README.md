# Hookdeck Event Gateway - Next.js Example

Minimal example of receiving webhooks through Hookdeck with signature verification using Next.js App Router.

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
   cp .env.example .env.local
   ```

3. Add your Hookdeck webhook secret to `.env.local`

## Run

```bash
npm run dev
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

## Endpoint

- `POST /webhooks` - Receives and verifies Hookdeck webhook events
