# Setting Up Column Webhooks

## Prerequisites

- A Column account (sandbox or production)
- A publicly reachable HTTPS endpoint, or a Hookdeck URL for local development

## Register Your Endpoint

1. Create a webhook endpoint in the Column Dashboard (Webhook settings), or through the API.
2. Set the endpoint URL (for local development, the Hookdeck URL from `npx hookdeck-cli listen 3000 column --path /webhooks/column`).
3. Choose the events to receive in `enabled_events`. Wildcards are allowed, so you can subscribe to a whole family of events. Recommended to start: `ach.outgoing_transfer.completed`, `ach.outgoing_transfer.returned`, `book.transfer.completed`.

## Get Your Signing Secret

Column generates a signing secret for each endpoint; retrieve it from the Dashboard's Webhook settings. Secrets are not shared across endpoints, so if you run several endpoints, keep one secret per endpoint. Use the secret as-is: its UTF-8 bytes are the HMAC key (don't hex- or base64-decode it).

To rotate, create a new endpoint and delete the old one.

Set it as `COLUMN_WEBHOOK_SECRET`.

## Testing

Use the sandbox environment: create the endpoint there, then trigger a transfer (for example a book transfer between sandbox accounts) and watch for `book.transfer.completed`. With the Hookdeck CLI running, each delivery shows up in the Hookdeck UI where you can inspect headers and replay it.
