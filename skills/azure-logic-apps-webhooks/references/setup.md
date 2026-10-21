# Setting Up Azure Logic Apps to Call Your Webhook

## Prerequisites

- An Azure subscription and a Logic Apps resource (Consumption or Standard), or a
  Power Automate flow with access to the premium HTTP action
- Your endpoint's public HTTPS URL (use the Hookdeck CLI below for local development)

## Add the HTTP Action

1. In the Azure portal, open your logic app and the workflow designer.
   - **Consumption**: *Development Tools* → designer.
   - **Standard**: *Workflows* → your workflow → *Tools* → designer.
2. Add the built-in **HTTP** action after your trigger.
3. Set **URI** to your endpoint, for example
   `https://example.com/webhooks/azure-logic-apps`, and **Method** to `POST`.
4. Under **Headers**, add `Content-Type: application/json`.
5. Set **Body** to the JSON you want to send (dynamic content and expressions are
   allowed). Consider including `@{workflow()['run']['name']}` for idempotency.

## Choose an Authentication Method

Open **Advanced parameters** → **Authentication**.

### Option 1: Basic (recommended for a shared-secret check)

- **Authentication**: Basic
- **Username** / **Password**: generate long random values
- Receiver: `AZURE_LOGIC_APPS_USERNAME`, `AZURE_LOGIC_APPS_PASSWORD`

Code view:

```json
"HTTP": {
  "type": "Http",
  "inputs": {
    "method": "POST",
    "uri": "https://example.com/webhooks/azure-logic-apps",
    "headers": { "Content-Type": "application/json" },
    "body": { "orderId": "@{triggerBody()?['orderId']}" },
    "authentication": {
      "type": "Basic",
      "username": "@parameters('webhookUser')",
      "password": "@parameters('webhookPassword')"
    }
  },
  "runAfter": {}
}
```

### Option 2: Raw

- **Authentication**: Raw
- **Value**: the full `Authorization` header value, e.g. `Bearer 3f9c...`
- Receiver: `AZURE_LOGIC_APPS_SECRET_HEADER=Authorization`,
  `AZURE_LOGIC_APPS_SHARED_SECRET=Bearer 3f9c...` (the whole value, scheme included)

```json
"authentication": { "type": "Raw", "value": "@parameters('webhookAuthHeader')" }
```

### Option 3: Custom header

- Leave **Authentication** as None and add a header such as
  `x-logic-apps-secret: <random secret>` under **Headers**.
- Receiver: `AZURE_LOGIC_APPS_SHARED_SECRET=<random secret>` (header name defaults to
  `x-logic-apps-secret`; change it with `AZURE_LOGIC_APPS_SECRET_HEADER`).
- Turn on **Secure Inputs** in the action's **Settings**: Logic Apps hides
  `Authorization` from run history by default, but custom headers are visible
  otherwise.

### Not a shared secret

**Active Directory OAuth** (Entra ID client secret or certificate), **Managed
identity** and **Client certificate** are also available. The first two send an Entra
ID bearer token you must validate as a JWT; the last authenticates at the TLS layer.
The examples in this skill don't handle them.

## Store the Secret Safely

- Use secured workflow parameters (`securestring`) or Azure Key Vault references
  instead of hard-coding credentials in the workflow definition.
- Use HTTPS. Basic credentials are only base64-encoded, not encrypted.

## Test

1. Start your receiver and a tunnel:
   ```bash
   npx hookdeck-cli listen 3000 azure-logic-apps --path /webhooks/azure-logic-apps
   ```
2. Put the tunnel URL in the HTTP action's **URI**, save, and **Run** the workflow.
3. In the run history, open the HTTP action to see the status code and response body
   your endpoint returned. In the Hookdeck CLI web UI you can inspect and replay the
   request.

## Restrict by IP (optional)

Calls originate from your region's Logic Apps outbound IP addresses (service tag
`LogicApps`; see *Limits and configuration* → *Firewall configuration*). The ranges are
shared across Azure customers, so combine an allowlist with credentials rather than
relying on it alone.
