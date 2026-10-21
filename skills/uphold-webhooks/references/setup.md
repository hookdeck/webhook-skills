# Setting Up Uphold Webhooks

## Prerequisites

- An Uphold Enterprise account, registered in the [Enterprise Portal](https://portal.enterprise.uphold.com)
- API client credentials (OAuth 2.0 client credentials) if you want to open the Webhooks Portal through the API
- A publicly reachable HTTPS endpoint (use the Hookdeck CLI below during development)

Uphold has two environments with separate configuration. Endpoints and secrets in one don't carry over to the other:

| Environment | API base URL |
|-------------|--------------|
| Sandbox | `https://api.enterprise.sandbox.uphold.com` |
| Production | `https://api.enterprise.uphold.com` |

## How Do I Open the Uphold Webhooks Portal?

Endpoints, event subscriptions, signing secrets and delivery logs live in the **Webhooks Portal**, a Svix-hosted app. You can open it in two ways.

**From the Enterprise Portal:** go to the **Webhooks** section.

**Through the API:** request a short-lived management link. This needs the `core.webhooks:management-link` scope.

```bash
# 1. Get an access token (client credentials)
curl -X POST https://api.enterprise.sandbox.uphold.com/core/oauth2/token \
  -u "$CLIENT_ID:$CLIENT_SECRET" \
  -d grant_type=client_credentials

# 2. Request the management link
curl -X POST https://api.enterprise.sandbox.uphold.com/core/webhooks/management-link \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

```json
{
  "managementLink": {
    "url": "https://app.svix.com/login#key=eyJhcHBJZCI...",
    "expiresAt": "2025-03-01T17:40:28.707594166Z"
  }
}
```

Open `managementLink.url` before `expiresAt`. You can embed the link in your own admin tools so that operators don't need Enterprise Portal access.

## Register Your Endpoint

1. In the Webhooks Portal, choose **Add Endpoint**.
2. Enter your URL, for example `https://your-app.com/webhooks/uphold`.
3. Subscribe to the events you handle. A good starting set:
   - `core.user.created`
   - `core.transaction.created`
   - `core.transaction.status-changed`
   - `core.account.balance-changed`
   - `core.external-account.status-changed`
   - the `core.kyc.*.status-changed` (or `core.kyb.*`) processes you track
4. Save the endpoint.

## Get Your Signing Secret

1. In the Webhooks Portal, open the endpoint you created.
2. Reveal and copy its **Signing Secret**. It looks like `whsec_` followed by base64.
3. Store it as `UPHOLD_WEBHOOK_SECRET`.

Each endpoint has its own secret, and Sandbox and Production secrets differ. Keep the whole value including `whsec_`; the `svix` SDK strips the prefix and base64-decodes the rest.

You can rotate the secret from the endpoint page. If you rotate, deploy the new value promptly. While a rotation is in progress, `Webhook-Signature` can carry more than one signature, and the verifier accepts a delivery if any of them matches.

## Test Your Endpoint

- **Local tunnel:** expose your local handler, then use the printed URL as the endpoint:
  ```bash
  npx hookdeck-cli listen 3000 uphold --path /webhooks/uphold   # Express / Next.js
  npx hookdeck-cli listen 8000 uphold --path /webhooks/uphold   # FastAPI
  ```
- **Send a test event** from the Webhooks Portal's testing tools, and inspect delivery logs there.
- **Trigger real events in Sandbox** with Uphold's [test helpers](https://developer.uphold.com/rest-apis/test-helpers), for example simulating a deposit to produce `core.transaction.*` and `core.account.balance-changed` events. Test helpers return `404` in Production.
- **Redeliver** a failed message from the Enterprise Portal (Webhooks section) or from the Webhooks Portal.

## Do I Need to Allowlist IP Addresses?

Only if your endpoint is behind a firewall or NAT. Deliveries come from Svix, so allow the addresses published at [https://docs.svix.com/webhook-ips.json](https://docs.svix.com/webhook-ips.json). An IP allowlist doesn't replace signature verification.
