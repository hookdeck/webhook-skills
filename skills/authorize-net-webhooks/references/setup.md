# Setting Up Authorize.net Webhooks

## Prerequisites

- An Authorize.net merchant account, or a free sandbox account
- A public HTTPS endpoint (use the Hookdeck CLI locally)

## 1. Generate a Signature Key

You must have a Signature Key before Authorize.net sends webhooks. In the Merchant Interface, go to **Account > Settings > Security Settings > General Security Settings > API Credentials and Keys**, and create a new Signature Key. Copy it into `AUTHORIZE_NET_SIGNATURE_KEY` exactly as shown.

When you generate a new Signature Key, update your handler (and any Hookdeck source) at the same time, because new notifications are signed with the new key.

## 2. Create the Webhook

**Merchant Interface:** in the Webhooks section, add an endpoint with your URL, pick events, and set it active.

**REST API:** authenticate with HTTP Basic auth (API Login ID as the username, Transaction Key as the password):

```bash
curl -u "$API_LOGIN_ID:$TRANSACTION_KEY" \
  -H "Content-Type: application/json" \
  -X POST https://apitest.authorize.net/rest/v1/webhooks \
  -d '{"name":"My Webhook","url":"https://example.com/webhooks/authorize-net","eventTypes":["net.authorize.payment.authcapture.created","net.authorize.customer.created"],"status":"active"}'
```

Use `apitest.authorize.net` for the sandbox and `api.authorize.net` for production.

## 3. Send a Test

`POST /rest/v1/webhooks/{webhookId}/pings` with an empty body sends a sample notification for that webhook's events. Or run a sandbox transaction.

### Local testing with the Hookdeck CLI

```bash
npx hookdeck-cli listen 3000 authorize-net --path /webhooks/authorize-net
```

Use the printed URL as the webhook URL.

## Using Hookdeck

Create a source with the **Authorize.net** source type and paste your Signature Key exactly as shown. Hookdeck verifies `X-ANET-Signature`. Verification is optional on the source, and Hookdeck applies no timestamp window.
