# Gorgias Webhooks - Express Example

Minimal example of receiving Gorgias HTTP integration webhooks with Express.
Gorgias doesn't sign these requests, so the handler authenticates a
shared-secret `Authorization: Bearer <secret>` header with a constant-time
compare, then dispatches on the `event` field you put in the body template.

## Prerequisites

- Node.js 18+
- A Gorgias account (owner or admin) to create an HTTP integration

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Generate a secret (`openssl rand -hex 32`) and set it as
   `GORGIAS_WEBHOOK_SECRET` in `.env`.

## Run

```bash
npm start
```

Server runs on http://localhost:3000. The endpoint is
`/webhooks/gorgias` and accepts `POST`, `PUT`, `PATCH` and `DELETE`.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 gorgias --path /webhooks/gorgias
```

In Gorgias (Settings → Account → HTTP integration → Add HTTP integration):

- **URL**: the HTTPS URL the CLI prints
- **HTTP Method**: `POST`, **Request content type**: `application/json`
- **Header**: `Authorization` = `Bearer <your GORGIAS_WEBHOOK_SECRET>`
- **Request body**:
  ```json
  {
    "event": "ticket-created",
    "ticket_id": "{{ticket.id}}",
    "subject": "{{ticket.subject}}",
    "status": "{{ticket.status}}",
    "customer_email": "{{ticket.customer.email}}",
    "updated_datetime": "{{ticket.updated_datetime}}"
  }
  ```
- **Triggers**: Ticket created (one integration per trigger, matching `event`)

Then create a ticket in Gorgias.

## Test

```bash
npm test
```

Or send a request by hand:

```bash
curl -X POST http://localhost:3000/webhooks/gorgias \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $GORGIAS_WEBHOOK_SECRET" \
  -d '{"event":"ticket-created","ticket_id":"48213","subject":"Where is my order?"}'
```
