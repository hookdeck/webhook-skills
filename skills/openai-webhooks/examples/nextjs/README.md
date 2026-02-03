# OpenAI Webhooks - Next.js Example

Next.js App Router example for receiving OpenAI webhooks with signature verification.

## Prerequisites

- Node.js 18+
- OpenAI account with webhook signing secret

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env.local
   ```

3. Add your OpenAI webhook signing secret to `.env.local`:
   - Get your secret from [OpenAI Platform](https://platform.openai.com) → Settings → Webhooks
   - It should start with `whsec_`

## Run

```bash
npm run dev
```

Server runs on http://localhost:3000

## Test with Hookdeck CLI

```bash
# Install Hookdeck CLI
brew install hookdeck/hookdeck/hookdeck

# Create tunnel to your local server
hookdeck listen 3000 --path /webhooks/openai

# Use the provided URL in OpenAI webhook settings
```

## Test

Run the test suite:

```bash
npm test
```

## API Routes

- `POST /webhooks/openai` - Webhook receiver endpoint

## Example Events

The webhook handler processes these OpenAI events:
- `fine_tuning.job.completed` - Fine-tuning job finished
- `fine_tuning.job.failed` - Fine-tuning job failed
- `batch.completed` - Batch processing completed
- `batch.failed` - Batch processing failed
- `realtime.session.created` - Realtime session created