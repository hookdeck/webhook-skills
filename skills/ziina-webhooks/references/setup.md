# Setting Up Ziina Webhooks

## Prerequisites

- A Ziina account with API access and an API token
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 ziina --path /webhooks/ziina` locally)

## Set a Secret

Set a secret when you register the webhook through the Ziina API. Without one, deliveries are unsigned and fail verification.

You choose the secret yourself; no format is documented. Store it as `ZIINA_WEBHOOK_SECRET` and use it as UTF-8 bytes, exactly as typed (not hex- or base64-decoded).

## Register Your Endpoint

Webhooks are configured through the API, not a dashboard. Call `POST /webhook` (see the [webhook API reference](https://docs.ziina.com/api-reference/webhook/index) for the base URL and authentication) with a JSON body:

```json
{ "url": "https://your-domain.com/webhooks/ziina", "secret": "your_chosen_secret" }
```

There is one webhook URL per account: calling it again overwrites the URL and secret.

## Events

Ziina sends `payment_intent.status.updated` and `refund.status.updated`. There is no per-event subscription to configure.

## Testing

Trigger a payment intent or refund in your Ziina account and watch the request arrive (the Hookdeck CLI web UI shows headers and body). To test your handler offline, sign a body yourself with HMAC-SHA256 and your secret and send it in `X-Hmac-Signature`; the example tests do this.
