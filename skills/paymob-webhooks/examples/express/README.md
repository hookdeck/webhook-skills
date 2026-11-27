# Paymob Webhooks - Express Example

Minimal example of receiving Paymob **Transaction Processed Callbacks** and card
token callbacks with
HMAC-SHA512 signature verification.

## Prerequisites

- Node.js 18+
- A Paymob account with an HMAC secret (Dashboard > Settings > Developers > API Keys, main account user only)

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Paymob HMAC secret to `.env`:
   ```bash
   PAYMOB_HMAC_SECRET=your_hmac_secret_here
   ```

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The webhook endpoint is
`POST /webhooks/paymob`.

## How Verification Works

Paymob does **not** sign the raw body. It computes HMAC-SHA512 (hex) over a
fixed, ordered concatenation of keys from `obj` (20 for `TRANSACTION`, 8 for
`TOKEN`) and sends the result as
the **`hmac` query parameter** (`?hmac=<hex>`). The handler parses the JSON,
rebuilds that string, and compares it timing-safely. See
[../../references/verification.md](../../references/verification.md) for the full
field list and gotchas.

## Test

```bash
npm test
```

The tests check the string builder against the concatenated string Paymob's
HMAC transaction page prints, verify Paymob's published card token example, and
assert that valid, invalid, missing, and tampered signatures are handled
correctly.

## Receive Real Webhooks Locally

Use the Hookdeck CLI to tunnel Paymob callbacks to your local server (no account
required):

```bash
npx hookdeck-cli listen 3000 paymob --path /webhooks/paymob
```

Set the printed URL as your callback URL in the Paymob dashboard.
