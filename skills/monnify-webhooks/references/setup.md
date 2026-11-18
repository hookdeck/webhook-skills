# Setting Up Monnify Webhooks

## Prerequisites

- A Monnify merchant account. Signed webhooks need the **live** environment.
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Get the Client Secret

In the Monnify dashboard, open **Developers** and copy the client secret key for the environment. Set `MONNIFY_CLIENT_SECRET` to it.

## 2. Set Webhook URLs

In the dashboard's developer settings, enter your URL for the events you want (transaction completion, disbursements, refunds, settlements).

## The Unsigned Sandbox

Monnify's sandbox sends webhooks **without** a `monnify-signature` header. These examples reject them with `401`, by design. To exercise your handler:

- Use the tests, which sign synthetic bodies with a synthetic secret.
- If you need sandbox deliveries to reach business logic, branch on your own environment in your own code. Never let a request skip verification in production.

A verified delivery needs a live merchant account and a real transaction.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 monnify --path /webhooks/monnify
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Create a source with the **Monnify** source type and paste your client secret key. Hookdeck verifies `monnify-signature`. Verification is optional on the source, and Hookdeck applies no timestamp window. Leave verification off while you test with the sandbox, which doesn't sign.
