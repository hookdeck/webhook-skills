# Setting Up Podium Webhooks

## Prerequisites

- A Podium location or organization, and a token granted by a user of it (OAuth) with the scopes of the event types you want
- A public HTTPS URL for your handler (use the Hookdeck CLI while developing, below)

## Create the Webhook (API only)

Podium webhooks are created with the webhook API endpoints, not in a dashboard. Each webhook is tied
to one location or organization and lists the event types it wants.

## Get Your Signing Secret

> Set a secret when you create the Podium webhook. Webhooks created without one are unsigned and fail verification.

The `secret` you pass when creating the webhook is the signing key; Podium doesn't generate one for
you. Choose a long random value and store it as `PODIUM_WEBHOOK_SECRET`. It is the HMAC key as-is:
don't hex- or base64-decode it. Podium: "When setting up a webhook you can optionally add a secret,
this will be used to sign all outgoing webhook requests. Any webhook with no secret will not be
signed." If you created one without a secret, create a new webhook with one.

## Receive Webhooks Locally

```bash
npx hookdeck-cli listen 3000 podium --path /webhooks/podium
```

Use port `8000` for the FastAPI example. Pass the printed URL as the webhook `url` when you create the webhook.

## Using Hookdeck as the Source

In Hookdeck choose the **Podium** source type and paste the webhook's `secret`. Hookdeck verifies the signature.

Podium's docs don't name the method it uses. If deliveries arrive with a method other than POST, allow that method on the Hookdeck source too ([custom methods](https://hookdeck.com/docs/sources#custom-methods)).

## Test Mode vs Live Mode

Podium offers test accounts (see its docs). Use one to exercise your handler before going live.
