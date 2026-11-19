# Setting Up CryptoProcessing Callbacks

## Prerequisites

- A CryptoProcessing merchant account
- Your application's public callback URL (use `npx hookdeck-cli listen 3000 cryptoprocessing --path /webhooks/cryptoprocessing` for local development)

## Get Your Signing Secret

Callbacks are signed with the secret of your **active Master API key**.

> Paste the secret key of your active Master API key. Rotating that key changes the callback secret.

1. Open the CryptoProcessing merchant portal and find your API keys.
2. Identify your active Master key. Only the Master key signs callbacks; custom keys never do.
3. Copy its secret key and store it as `CRYPTOPROCESSING_WEBHOOK_SECRET`. Use it as-is: it is not hex- or base64-decoded.
4. The `X-Processing-Key` header on each callback carries the public part of the Master key that signed it. If you activate a different Master key, update the secret. Callbacks pause while no Master key is active and are sent, signed with the new key, once you activate one.

## Register Your Callback URL

1. In the merchant portal, go to **Settings** > **Callbacks**, click **Set up URL** and enter `https://your-app.example.com/webhooks/cryptoprocessing`, then confirm with your 2FA code. The URL must use HTTPS and a domain name.
2. There is one callback URL per merchant account, and setting a new one replaces it. Deposits, withdrawals, exchanges, payment requests and invoices all go there, so route on the body's `type` in your handler.
3. Deliveries are `POST` requests with a JSON body.

## Test Mode vs Live Mode

Sandbox (`app.sandbox.cryptoprocessing.com`) and production use separate key pairs, and callbacks are signed with whichever Master key is active for the account that sent them, so keep a separate `CRYPTOPROCESSING_WEBHOOK_SECRET` for each.

## Testing

In the sandbox, test a deposit by withdrawing funds from your merchant account to a deposit address you generated, and watch your endpoint. Compare your implementation against the docs test vector in [verification.md](verification.md). To resend a transaction's latest callback, open it under **Transactions**, switch to the **Callback** tab and click **Repeat callback**. Make sure your endpoint answers `200` only after the callback is stored, since only `200` stops the retries.
