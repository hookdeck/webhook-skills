# Setting Up Flutterwave Webhooks

## Prerequisites

- A Flutterwave account (sign-up is self-serve; test mode is available immediately).
- A public HTTPS endpoint. For local development: `npx hookdeck-cli listen 3000 flutterwave --path /webhooks/flutterwave`.

## 1. Set the Webhook URL and Secret Hash

1. Log in to the [dashboard](https://dashboard.flutterwave.com/login) and click **Settings**.
2. Go to **Webhooks** and enter your webhook URL, e.g. `https://example.com/webhooks/flutterwave`.
3. Set a **secret hash**: any random value you choose, for example `openssl rand -hex 32`. It's required for v4 and optional (but strongly recommended) for v3.
4. Check the event boxes and **enable webhook retries**, then save.

Store the same secret hash in your app:

```bash
FLUTTERWAVE_SECRET_HASH=your-secret-hash
```

Flutterwave's own samples read it from `FLW_SECRET_HASH`; any name works.

**Hookdeck:** on a Flutterwave source (`FLUTTERWAVE`), enter the same secret hash to verify v4's `flutterwave-signature`. Verification is optional on the source. v3 webhooks carry no signature, so leave verification off on a source that receives v3 webhooks.

## 2. Which Version Are You On?

- **v3** accounts see Public Key, Private Key and Encryption Key in the dashboard. Webhooks carry `verif-hash`.
- **v4** accounts use the v4 API credentials and `https://developersandbox-api.flutterwave.com` for test mode. Webhooks carry `flutterwave-signature`.

The examples handle both, so you can deploy before switching.

## 3. Trigger a Test Webhook

**v4 (sandbox):** most test calls take an `X-Scenario-Key` header that picks the outcome. For transfers, Flutterwave says: "If you do not pass the `X-Scenario-Key` header, the transfer remains in a `pending` state and no webhook is sent for the test." Create a test charge or transfer with a scenario key, and a `charge.completed` or `transfer.disburse` webhook follows. You can also resend one with `POST /resend-webhook` and a `chg_...`, `trf_...` or `wbk_...` ID.

**v3:** make a test-mode payment with a [test card](https://developer.flutterwave.com/docs/testing), or resend a transaction's webhook with `POST https://api.flutterwave.com/v3/transactions/{id}/resend-hook`.

With the Hookdeck CLI you can inspect each request's headers and body:

```bash
npx hookdeck-cli listen 3000 flutterwave --path /webhooks/flutterwave
```

Flutterwave also suggests [webhook.site](https://webhook.site) for a quick look at payloads without any code.

## 4. Go Live

Check that the live webhook settings point at your production URL with the secret hash your production app uses. Respond with exactly `200` within 60 seconds, and re-query each transaction through the API before giving value.

## Rotating the Secret Hash

Flutterwave uses one secret hash at a time. Update it in the dashboard and in `FLUTTERWAVE_SECRET_HASH` (and on a Hookdeck source) together. Deliveries that fail during the switch are retried 30 minutes later if retries are on, or can be resent from the API.
