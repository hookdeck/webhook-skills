# Setting Up QuickBooks Online Webhooks

## Prerequisites

- An [Intuit Developer](https://developer.intuit.com/) account with an app that uses the QuickBooks Online Accounting API
- OAuth 2.0 set up for the app. You only get webhooks for companies that connected through OAuth 2.0, and that includes sandbox companies.
- A public HTTPS endpoint (for local development, use the Hookdeck CLI below)

## Development vs Production

Each app has **two separate webhook configurations**:

- **Development**: sandbox companies and testing
- **Production**: live, in-production companies

Each has its own endpoint URL, event selection and **Verifier Token**. Set them up separately.

## Register Your Endpoint

1. Sign in to the Intuit Developer portal.
2. Select **My Hub > App dashboard** from the upper-right of the toolbar.
3. Open your app.
4. In the left navigation, select **Webhooks**.
5. Select **Development** or **Production**.
6. Enter the **Endpoint URL**, e.g. `https://your-domain.com/webhooks/quickbooks`.
7. Open the **Show webhooks** dropdown and select the entities and operations you need (e.g. Invoice: Create/Update, Payment: Create, Customer: Create/Update/Merge).
8. Select **Save**.

It can take up to **five minutes** for the first notification to arrive.

## Get Your Verifier Token

After you save the endpoint, Intuit generates an app-specific **Verifier Token**:

1. Go to **My Hub > App dashboard** and open your app.
2. Select **Webhooks**, then **Development** or **Production**.
3. Copy the **Verifier Token** field.

Store it as an environment variable:

```bash
QUICKBOOKS_WEBHOOK_VERIFIER_TOKEN=your_verifier_token
```

Use the token for the environment that sends to the endpoint. A sandbox token won't verify production deliveries.

## Signature Header

Every notification carries:

| Header | Purpose |
|--------|---------|
| `intuit-signature` | base64 HMAC-SHA256 of the raw body, keyed with the Verifier Token |
| `intuit-t-id` | Intuit transaction ID, useful for support requests |
| `intuit-created-time` | When the notification was created |

See [verification.md](verification.md) for the algorithm.

## Local Testing

Forward deliveries to your local server with the Hookdeck CLI. No account is required:

```bash
npx hookdeck-cli listen 3000 quickbooks --path /webhooks/quickbooks
```

Use `8000` instead of `3000` for the FastAPI example. The CLI prints a public URL. Paste it, with the `/webhooks/quickbooks` path, into the **Development** Endpoint URL, then make a change in a connected sandbox company (for example, create a customer or an invoice).

## Test Mode vs Live Mode

- Use the **Development** configuration with a sandbox company while building.
- Before going live, set up the **Production** endpoint and switch your environment to the Production Verifier Token.
- If you receive nothing, check that the company has authorized your app through OAuth 2.0 and that you selected the entity and operation under **Show webhooks**.
