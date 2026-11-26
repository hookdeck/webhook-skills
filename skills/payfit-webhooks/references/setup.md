# Setting Up PayFit Webhooks

## Prerequisites

- PayFit partner OAuth credentials (client ID and client secret)
- Webhook access, enabled by PayFit on request
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Request Access

Ask PayFit to enable webhooks for your partner account. PayFit then configures an environment where you can pick the events to subscribe to.

## 2. Open the Webhooks Dashboard

```bash
curl 'https://oauth.payfit.com/webhooks?clientSecret=xxx&clientId=xxx'
```

The response includes a `webhookConfigUrl`. Open it to reach your webhooks dashboard. PayFit warns that the link "must be shared with care as it allows access to your customers' data".

## 3. Add an Endpoint

In the dashboard, add your URL (for example `https://your-app.example.com/webhooks/payfit`) and choose events: `integration.activated`, `integration.deactivated`, `payroll.run`.

## 4. Copy the Signing Secret

Each endpoint has a signing secret that starts with `whsec_`. Set it as `PAYFIT_WEBHOOK_SECRET`. The examples accept it with or without the prefix.

## Test

Svix dashboards can send a test event to an endpoint. Otherwise activate your integration on a test company, or run a payroll.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 payfit --path /webhooks/payfit
```

Add the printed URL as an endpoint.

## Using Hookdeck

Create a source with the **PayFit** source type and paste the endpoint's `whsec_…` signing secret. Hookdeck verifies the `svix-id`, `svix-timestamp` and `svix-signature` headers.
