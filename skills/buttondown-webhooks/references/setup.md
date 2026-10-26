# Setting Up Buttondown Webhooks

## Prerequisites

- A Buttondown account
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI for local development)

## Set a Signing Key

Set a signing key on the Buttondown webhook. Without one, deliveries are unsigned and fail verification.

The signing key can be any string you choose; make it long and random. Without a signing key Buttondown sends no `X-Buttondown-Signature` header and your handler has nothing to verify. Use the key exactly as typed (UTF-8): it is not hex- or base64-decoded. Save it as `BUTTONDOWN_WEBHOOK_SECRET`.

## Register Your Endpoint

1. In Buttondown, open the webhook settings (Events & webhooks) and add a webhook, or create one with the API (`POST` to the webhooks route).
2. Enter your endpoint URL.
3. Choose the event types to receive, for example `subscriber.created`, `subscriber.confirmed`, `subscriber.unsubscribed`, `email.sent`.
4. Fill in the **Signing key** field and save.

Automation `send_post_request` actions can sign too: add a `signing_key` field to the action's metadata.

## Use Hookdeck

In Hookdeck, create a source of the Buttondown type, enter the same signing key, and use the source URL as the webhook URL in Buttondown. Set a signing key on the Buttondown webhook. Without one, deliveries are unsigned and fail verification.

For local development:

```bash
npx hookdeck-cli listen 3000 buttondown --path /webhooks/buttondown
```

## Testing

Buttondown's API has a route to test a webhook and a route to list a webhook's delivery attempts, which helps when a delivery is failing. Remember a webhook that fails on 5 consecutive events is disabled, so re-enable it after fixing the endpoint.
