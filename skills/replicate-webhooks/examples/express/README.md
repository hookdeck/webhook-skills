# Replicate Webhooks - Express Example

Minimal example of receiving Replicate webhooks with signature verification in Express.

## Prerequisites

- Node.js 18+
- Replicate account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Replicate webhook signing secret to `.env`

## Run

```bash
npm start
```

Server runs on http://localhost:3000

## Test with Hookdeck CLI

1. Install Hookdeck CLI:
   ```bash
   npm install -g hookdeck-cli
   ```

2. Forward webhooks to your local server:
   ```bash
   hookdeck listen 3000 --path /webhooks/replicate
   ```

3. Use the provided Hookdeck URL when creating Replicate predictions:
   ```javascript
   const prediction = await replicate.run("model/version", {
     input: { /* ... */ },
     webhook: "https://your-url.hookdeck.com",
     webhook_events_filter: ["start", "completed"]
   });
   ```

## Test Suite

Run the test suite:
```bash
npm test
```

The tests verify:
- Signature verification with valid and invalid signatures
- Proper handling of all event types
- Error cases (missing headers, expired timestamps)
- Raw body parsing requirements