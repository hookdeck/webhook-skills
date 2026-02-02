# Paddle Webhooks - Express Example

Minimal example of receiving Paddle webhooks with signature verification.

## Prerequisites

- Node.js 18+
- Paddle account with webhook secret key

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Paddle webhook secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test

### Using Paddle Webhook Simulator

1. Go to **Paddle Dashboard → Developer tools → Simulations**
2. Create a new simulation with your endpoint URL
3. Run the simulation to send test events

### Using Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Forward webhooks to localhost
hookdeck listen 3000 --path /webhooks/paddle
```

Then use the Hookdeck URL as your notification destination in Paddle.

## Endpoint

- `POST /webhooks/paddle` - Receives and verifies Paddle webhook events
