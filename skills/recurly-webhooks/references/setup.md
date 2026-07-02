# Setting Up Recurly Webhooks

## Prerequisites

- A Recurly site with admin access to the Admin UI
- Your application's public HTTPS webhook endpoint URL
  (e.g. `https://api.example.com/webhooks/recurly`)

> Webhook endpoints are configured in the **Recurly Admin UI only** — they
> cannot be created or edited through the API.

## Register Your Endpoint

1. Log in to the Recurly Admin UI.
2. Go to **Integrations → Webhooks** (Configuration → Webhooks on some sites).
3. Click **Add Endpoint** (or **New Endpoint**).
4. Enter your endpoint **URL**. It must be HTTPS.
5. Choose the payload format: **JSON** (recommended — it is signed) or XML.
6. Select the notification types to receive (up to 10 per endpoint), e.g.
   `new_subscription_notification`, `updated_subscription_notification`,
   `successful_payment_notification`, `failed_payment_notification`.
7. Save the endpoint.

## Get Your Signing Secret (JSON)

For JSON endpoints, Recurly generates a **secret key** used to sign each
notification (the `recurly-signature` header).

1. Open the endpoint on the **Webhook Endpoints** page.
2. Copy the endpoint's **secret key**.
3. Store it as `RECURLY_WEBHOOK_SECRET` in your app's environment.

**Key rotation:** When you regenerate the secret key, the old key stays valid for
**24 hours**. During that window Recurly may send **multiple** signatures in the
`recurly-signature` header (one per active key), so your verifier must accept the
notification if **any** signature matches.

## Configure HTTP Basic Auth (recommended)

Because XML payloads are unsigned — and as defense-in-depth for JSON — Recurly
can send HTTP Basic Auth credentials with every request.

1. On the endpoint configuration, set a **username** and **password**.
2. Store them as `RECURLY_WEBHOOK_USER` and `RECURLY_WEBHOOK_PASSWORD`.
3. In your handler, reject requests whose `Authorization: Basic ...` header does
   not match (using a constant-time comparison).

## Configure the IP Allowlist (recommended)

Restrict your endpoint (at the firewall, load balancer, or app layer) to accept
requests only from Recurly's published IP ranges. See Recurly's **IP Allowlist**
documentation for the current list, as it can change.

> If you run Apache with ModSecurity, you may need to disable rule `#990011` to
> stop it blocking Recurly webhook requests.

## Get an API Key (optional, to confirm state)

To fetch the referenced object and confirm its current state after receiving a
notification, create an API key:

1. Go to **Integrations → API Credentials → Private API Key**.
2. Copy the key and store it as `RECURLY_API_KEY`.
3. Use the `recurly` SDK to look up the subscription/transaction/invoice.

## Test Your Endpoint

- Send yourself a test notification by performing the action in the Admin UI
  (e.g. create a test subscription) on a **sandbox** site.
- Use the **Local Development** tunnel below to receive webhooks on your machine.
- Inspect delivered notifications and failure reasons in the Admin console
  (retained for 15 days).

## Local Development

Use the Hookdeck CLI to receive webhooks locally — no account or install
required:

```bash
npx hookdeck-cli listen 3000 recurly --path /webhooks/recurly
```

Point your Recurly endpoint URL at the tunnel URL the CLI prints.
