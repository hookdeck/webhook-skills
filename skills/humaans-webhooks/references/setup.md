# Setting Up Humaans Webhooks

## Prerequisites

- A Humaans account where you are an **Owner** (only Owners can create webhooks in the app)
- A public HTTPS URL for your endpoint
- For the API route: an API access token with the `webhooks:manage` scope

## How Do I Create a Webhook in Humaans?

1. Open the **webhooks page** in Humaans as an Owner and create a webhook.
2. Give it a name, set the endpoint URL, and choose the events to subscribe to.
3. **Publish** the webhook. A created webhook is inactive and receives no events until it is published.
4. Copy the signing secret (`whsec_...`) and store it as `HUMAANS_WEBHOOK_SECRET`.

## How Do I Create a Webhook Through the API?

```bash
curl https://app.humaans.io/api/webhooks \
  -H 'Authorization: Bearer <your_api_access_token>' \
  -H 'Content-Type: application/json' \
  -X POST \
  -d '{
    "name": "Payroll integration",
    "prodEndpointUrl": "https://example.com/webhooks/humaans",
    "subscribedEvents": ["person.created", "person.offboarded", "timeAway.approved"],
    "status": "active"
  }'
```

The response includes `prodEndpointSignature` (`whsec_...`): that is the signing secret. When a webhook is created or patched with `status: "active"`, `prodEndpointUrl` and `subscribedEvents` are mandatory. `status` is one of `draft`, `active` or `disabled`.

You can also list, retrieve, update (`PATCH`) and delete webhooks under `/api/webhooks`.

## Authentication

Deliveries are authenticated by the Standard Webhooks signature. Humaans also documents the source IP addresses events come from (`52.215.16.239`, `54.216.8.72`, `63.33.109.123`, `2a05:d028:17:8000::/52`), which you can allowlist. The API access token is used only when calling the Humaans API, not on incoming webhooks.

## Local Testing

```bash
npx hookdeck-cli listen 3000 humaans --path /webhooks/humaans
```

Use the URL the CLI prints as the webhook's endpoint URL, publish the webhook, then trigger a change (for example edit a person) to receive an event.
