# Setting Up DealHub Webhooks

Docs: [How to Configure Webhooks](https://developers.dealhub.io/docs/how-to-configure-webhooks)

## Prerequisites

- A DealHub **administrator** login
- A publicly reachable **HTTPS** endpoint that accepts POST requests (for
  local development, see [Local development](#local-development))

## Choose and Create Your Credential

DealHub doesn't generate a secret for you. You choose the credential your
endpoint expects and give it to DealHub:

- **Token mode:** generate a long random token, e.g.
  `openssl rand -hex 32`. Store it as `DEALHUB_WEBHOOK_TOKEN`.
- **Basic mode:** pick a username and password. Store them as
  `DEALHUB_WEBHOOK_USERNAME` and `DEALHUB_WEBHOOK_PASSWORD`.

Prefer Token or Basic. **None** sends no credential at all, so use it only if
the endpoint URL itself carries a Shared Access Signature (SAS) token.

## Register Your Endpoint

1. Log in as an administrator and switch to **admin mode**.
2. Go to **System Settings → API Settings**.
3. In the **Webhooks** section, add a new webhook.
4. Fill in:
   - **Webhook Name** — e.g. "Quote Won to BI"
   - **Webhook URL** — e.g. `https://your-app.example.com/webhooks/dealhub`
5. Select the events to subscribe to, e.g. `draftQuote`, `primaryQuote`,
   `quoteReady`, `quoteWon`.
6. Select the **Authentication Type** and enter the credential:
   - **Token** → your token. DealHub sends `Authorization: Bearer <TOKEN>`.
   - **Basic** → your username and password. DealHub sends
     `Authorization: Basic <CREDENTIALS>`.
   - **None** → nothing is sent.
7. Save. DealHub starts sending events to the URL.

## Add Playbook Answers to Payloads (Optional)

1. Go to **Version Settings** and choose the version.
2. Open **Advanced Settings → Open API**.
3. Under **Webhook data mapping**, select up to five playbook questions.
   Their answers arrive in `additional_data` for events in that version.

## Testing

DealHub has no "send test event" button documented. To test, trigger real
events in a sandbox or test account: create and save a quote (`draftQuote`),
mark it primary (`primaryQuote`), then submit it (`quoteReady` or
`quotePendingApproval`).

## Local Development

```bash
npx hookdeck-cli listen 3000 dealhub --path /webhooks/dealhub
```

Use `8000` instead of `3000` for the FastAPI example. Paste the printed HTTPS
URL into **Webhook URL** in DealHub. The Hookdeck web UI shows each request's
`Authorization` header and body, which helps when debugging authentication.
