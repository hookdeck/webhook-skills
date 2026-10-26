# Setting Up Monerium Webhooks

## Prerequisites

- A Monerium application ([sandbox](https://sandbox.monerium.dev) while building; production once your profile is approved) of the **Private** plan, with its client id and client secret
- Your application's public HTTPS webhook URL (use the Hookdeck CLI for local development)

## You Create the Secret

Monerium does not generate a signing secret. You create it and send it to Monerium when you register the webhook. Hookdeck's configuration alert for this source reads:

> You create the secret when you register the webhook: generate whsec_ followed by base64 random bytes, send it to Monerium and paste the same value here.

```javascript
import crypto from 'crypto';

const secret = 'whsec_' + crypto.randomBytes(32).toString('base64');
```

Store the full value, prefix included, in `MONERIUM_WEBHOOK_SECRET`. You need it to verify incoming requests. Keep it out of client-side code and version control.

## How Do I Register a Webhook?

1. Get an access token with the client-credentials grant (it expires after 1 hour):

   ```javascript
   const response = await fetch('https://api.monerium.dev/auth/token', {
     method: 'POST',
     headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
     body: new URLSearchParams({
       grant_type: 'client_credentials',
       client_id: 'YOUR_CLIENT_ID',
       client_secret: 'YOUR_CLIENT_SECRET',
     }),
   });
   ```

2. Register the endpoint with `POST /webhooks`, sending your own secret and the event types:

   ```javascript
   await fetch('https://api.monerium.dev/webhooks', {
     method: 'POST',
     headers: {
       Authorization: `Bearer ${access_token}`,
       'Content-Type': 'application/json',
     },
     body: JSON.stringify({
       url: 'https://your-app.com/webhooks/monerium',
       secret, // the whsec_ value you generated
       types: ['order.created', 'order.updated'],
     }),
   });
   ```

3. Monerium immediately sends a `subscription.created` event to your URL. **Respond `200 OK` to activate the subscription.** Your handler must already be deployed and verifying with the same secret, and must not reject this event.

Keep the client secret and access token server-side; never expose them to frontend code.

## Retries

If your endpoint does not return `200 OK`, Monerium retries up to 10 times over 12 hours with exponential backoff. Store processed `webhook-id` values so a retried event is not handled twice. The docs give no timeout or ordering statement.

## Testing Locally

```bash
# Express / Next.js (use 8000 for FastAPI). No install or account required.
npx hookdeck-cli listen 3000 monerium --path /webhooks/monerium
```

Register the URL the CLI prints with `POST /webhooks` (use the sandbox while testing), with the secret from `MONERIUM_WEBHOOK_SECRET`. The `subscription.created` event arrives right away, so you can confirm the signature check end to end. Then place a sandbox order to see `order.created` and `order.updated` deliveries.

## Sandbox vs Production

Build against the sandbox at sandbox.monerium.dev. For production, complete KYC/KYB at monerium.app/profiles and create a production application; private applications need no partner review. Register the webhook again in production with a secret of your own.
