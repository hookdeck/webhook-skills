# Salesforce Webhooks - Next.js Example

Minimal example of receiving Salesforce **Outbound Messages** with the Next.js App
Router, validating the `OrganizationId`, and returning the required SOAP
`<Ack>true</Ack>` response.

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
npm run dev
```

The route is served at `POST http://localhost:3000/webhooks/salesforce`.

## Local Testing with Hookdeck CLI

Expose your local server so Salesforce can reach it (no account required):

```bash
npx hookdeck-cli listen 3000 salesforce --path /webhooks/salesforce
```

Point your Outbound Message **Endpoint URL** at the Hookdeck URL, then edit a
matching record in Salesforce to trigger a delivery.

## Test

```bash
npm test
```

The tests build real Outbound Message SOAP envelopes and assert the route acks
valid messages, rejects a mismatched `OrganizationId`, and handles multiple
notifications per message.

## The Route

The handler lives at `app/webhooks/salesforce/route.ts`. It reads the **raw** body
with `request.text()` (Salesforce sends `Content-Type: text/xml`), parses the SOAP
with `fast-xml-parser`, validates `OrganizationId`, and returns the SOAP ack.
