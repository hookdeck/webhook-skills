# GitHub Webhooks - Next.js Example

Minimal example of receiving GitHub webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- GitHub repository with webhook configured

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your GitHub webhook secret to `.env.local`

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

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/github
```

## Endpoint

- `POST /webhooks/github` - Receives and verifies GitHub webhook events
