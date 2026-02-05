# Vercel Webhooks - Next.js Example

Minimal example of receiving Vercel webhooks with signature verification using Next.js App Router.

## Prerequisites

- Node.js 18+
- Vercel account with Pro or Enterprise plan
- Webhook secret from Vercel dashboard

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your Vercel webhook secret to `.env.local`:
   ```
   VERCEL_WEBHOOK_SECRET=your_secret_from_vercel_dashboard
   ```

## Run

Start the development server:
```bash
npm run dev
```

Server runs on http://localhost:3000

The webhook endpoint is available at:
```
POST http://localhost:3000/webhooks/vercel
```

## Test

Run the test suite:
```bash
npm test
```

## Production Build

Build for production:
```bash
npm run build
npm start
```

## Local Testing with Hookdeck

For local webhook development, use the Hookdeck CLI:

```bash
# Install Hookdeck CLI
npm install -g hookdeck-cli

# Start local tunnel
hookdeck listen 3000 --path /webhooks/vercel

# Copy the webhook URL and add it to your Vercel dashboard
```

## Project Structure

```
.
├── app/
│   └── webhooks/
│       └── vercel/
│           └── route.ts    # Webhook handler
├── test/
│   └── webhook.test.ts     # Tests with signature verification
├── vitest.config.ts
├── .env.example
├── package.json
├── tsconfig.json
└── README.md
```

## API Route Details

The webhook handler is implemented as a Next.js App Router API route:

- Location: `app/webhooks/vercel/route.ts`
- Method: POST only
- Body parsing disabled (uses raw body for signature verification)
- TypeScript for type safety

## Triggering Test Events

To trigger a test webhook from Vercel:

1. Make a small change to your project
2. Deploy with: `vercel --force`
3. This will trigger a `deployment.created` event

## Common Issues

### Signature Verification Failing

- Ensure you're using the raw request body (not parsed JSON)
- Check that the secret in `.env.local` matches exactly
- Verify the header name is lowercase: `x-vercel-signature`

### Environment Variables Not Loading

- Use `.env.local` for local development (not `.env`)
- Restart the dev server after changing env variables
- Access via `process.env.VERCEL_WEBHOOK_SECRET`

### Type Errors

- This example uses TypeScript
- Run `npm run build` to check for type errors
- VS Code should show inline type errors