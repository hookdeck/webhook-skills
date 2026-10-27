# Setting Up OxaPay Webhooks

## Prerequisites

- An OxaPay merchant account
- Your merchant API key (payment callbacks) and/or payout API key (payout callbacks)
- A public HTTPS endpoint (OxaPay does not call private networks such as localhost)

## Get Your Signing Secret

OxaPay has no separate webhook secret. It signs with your API keys:

- **Payment callbacks** (invoice, white-label, static address, payment link, donation): your `MERCHANT_API_KEY`
- **Payout callbacks**: your `PAYOUT_API_KEY`

Set the key as `OXAPAY_WEBHOOK_SECRET`. One deployment (or one Hookdeck source) verifies one key, so use a separate one for each.

## Register Your Endpoint

There is no webhook registration screen. Put your endpoint in the `callback_url` field of each merchant or payout request, for example `https://example.com/webhooks/oxapay`. The endpoint must accept `POST` with a JSON body and return HTTP 200 with the body `ok`. If a firewall such as Cloudflare sits in front of your server, allow OxaPay's IP addresses (request the list from contact@oxapay.com).

## Using Hookdeck

Create a source of type OxaPay. Hookdeck shows this setup note, and it applies to your own handler too:

Paste your merchant API key for payment callbacks, or your payout API key for payout callbacks, and use a separate source for each. OxaPay expects an "ok" response body, so set the source's custom response to ok.

For local testing:

```bash
npx hookdeck-cli listen 3000 oxapay --path /webhooks/oxapay
```

## Test Mode vs Live Mode

Use a request catcher such as requestcatcher.com or webhook.site as the `callback_url` to inspect real callbacks, or a tunnel to your local server. There is no signature-bearing test event: create a small invoice or payout to receive real callbacks.
