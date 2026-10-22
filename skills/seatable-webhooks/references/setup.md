# Setting Up SeaTable Webhooks

## Prerequisites

- A SeaTable account with access to the base
- A publicly reachable HTTPS endpoint (for local work use `npx hookdeck-cli listen 3000 seatable --path /webhooks/seatable`)

## How Do I Create a Webhook?

1. On the SeaTable home page, hover over the base.
2. Open the context menu and choose **Advanced > Webhooks**.
3. Enter the destination URL.
4. Enter a **secret key** (strongly recommended, see below) and confirm.

The webhook is active immediately and always uses `POST`.

## How Do I Get the Secret Key?

You choose it. The secret key is a shared secret between you and SeaTable; paste the same value into `SEATABLE_WEBHOOK_SECRET`. It may be left empty, but then SeaTable sends no `X-Seatable-Signature` header and you cannot tell real events from forged ones.

## Which Events Are Sent?

Every row insert, modify and delete in the base. There is no event filter. Structural changes (columns, views, comments, row locks) are not sent.

## What Happens When My Endpoint Fails?

SeaTable sets the webhook to `invalid` after 5 consecutive non-200 responses. Fix the endpoint, then open the webhook, save it again without changes, and it becomes active.

## Testing

Add, edit or delete a row in the base and watch the delivery arrive. SeaTable has no test-event button.
