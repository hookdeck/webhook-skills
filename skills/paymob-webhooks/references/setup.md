# Setting Up Paymob Webhooks

## Prerequisites

- A Paymob merchant account with access to the dashboard for your region
  (Egypt, Oman, Saudi Arabia or the UAE; Paymob has no global account)
- Your application's publicly reachable webhook endpoint URL
  (e.g. `https://your-app.com/webhooks/paymob`)

## Get Your HMAC Secret

Paymob signs callbacks with an **HMAC secret**, not your secret, public or API
key.

1. Log in to the Paymob dashboard as the **main account user**. Sub-users can't
   see the HMAC secret.
2. Go to **Settings > Developers > API Keys**.
3. Copy the **HMAC secret**. If the main user can't see it, Paymob asks for a
   support ticket.
4. Store it as `PAYMOB_HMAC_SECRET` in your environment. Never commit it.

The same secret verifies transaction, card token and response callbacks, and
subscription callbacks.

## Set Your Callback URLs

Per integration ID, in the dashboard:

1. Go to **Settings > Payment Integrations** and pick test or live mode.
2. Click the integration ID you use. Its details page opens in edit mode.
3. Fill in **Webhook URL** (the server-to-server POST, for transaction and card
   token callbacks) and, if you want the browser return, **Redirect URL**.
4. Press **Save Changes**.

Per payment, in the API: pass `notification_url` (processed callback) and
`redirection_url` (browser redirect, card and wallet methods only) when you
create the intention. They override the integration ID's URLs.

## How the `hmac` Parameter Arrives

- **POST callbacks (`TRANSACTION`, `TOKEN`):** JSON body plus `?hmac=<hex>` on
  the URL. Read the signature from the query string, not a header.
- **Browser redirect (GET):** the transaction fields **and** `hmac` are query
  parameters.
- **Subscription callbacks:** `hmac` is a field in the JSON body.

## Test Mode vs Live Mode

- Test and live use the same regional base URL. The mode comes from the keys and
  integration IDs you use.
- Use a test integration ID first, pay with Paymob's test credentials, then
  refund or void to see the follow-up callbacks.
- Paymob's webhook testing tool (https://hooks.paymob.com/) gives you a
  temporary URL to inspect what Paymob sends.

## Local Testing

Expose your local server with the Hookdeck CLI (no account required):

```bash
npx hookdeck-cli listen 3000 paymob --path /webhooks/paymob
```

Use the printed URL as the Webhook URL on your test integration ID (or as
`notification_url`) while developing. See [verification.md](verification.md)
for how to confirm signatures.
