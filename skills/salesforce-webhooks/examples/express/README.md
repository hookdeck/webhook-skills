# Salesforce Webhooks - Express Example

Minimal example of receiving Salesforce **Outbound Messages** (the native
Flow/Workflow "webhook") with Express, validating the `OrganizationId`, and
returning the required SOAP `<Ack>true</Ack>` response.

Salesforce Outbound Messages have **no signature** — you authenticate by matching
the `<OrganizationId>` in the SOAP body against your org id (plus HTTPS + IP
allowlisting at the edge).

## Prerequisites

- Node.js 18+
- A Salesforce org with an Outbound Message configured (see
  [../../references/setup.md](../../references/setup.md))
- Your 18-character Salesforce Organization Id

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Add your Salesforce Organization Id to `.env` as `SALESFORCE_ORG_ID`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000 and listens at `POST /webhooks/salesforce`.

## Local Testing with Hookdeck CLI

Expose your local server so Salesforce can reach it (no account required):

```bash
npx hookdeck-cli listen 3000 salesforce --path /webhooks/salesforce
```

Point your Outbound Message **Endpoint URL** at the Hookdeck URL, then edit a
matching record in Salesforce (or use **Setup → Outbound Messages → View Message
Delivery Status → Retry**) to trigger a delivery.

## Test

```bash
npm test
```

The tests build real Outbound Message SOAP envelopes and assert the listener acks
valid messages, rejects mismatched/absent `OrganizationId`, and handles multiple
notifications per message.
