# Setting Up JFrog Webhooks

## Prerequisites

- A JFrog Platform account with permission to manage webhooks (an admin, or a project admin
  for project webhooks)
- A public HTTPS URL for your endpoint. During development, tunnel to localhost:

```bash
npx hookdeck-cli listen 3000 jfrog --path /webhooks/jfrog
```

(Use port `8000` for the FastAPI example.)

## 1. Generate a Secret Token

```bash
openssl rand -hex 32
```

Put it in your app's `.env` as `JFROG_WEBHOOK_SECRET`.

## 2. Create the Webhook

1. In the JFrog Platform UI, select **All Projects** (or a specific project), then open the
   **Platform** module → **Integrations** → **Webhooks**.
2. Click **New Webhook**, make sure the **Predefined** toggle is selected, and enter a name.
3. **URL**: your endpoint, e.g. `https://your-app.example.com/webhooks/jfrog`.
4. **Secret token**: paste the secret token from step 1.
5. Leave the option to use the secret for signing **off** (the default). With it off, JFrog sends the secret
   in the `X-JFrog-Event-Auth` header, which is what these examples check.
6. Choose the **domain** and **events** (e.g. Artifact: deployed, deleted, moved; Docker:
   pushed; Build: uploaded) and the repositories or build patterns they apply to.
7. Click **Test** to send a fake request, then **Create**.

## Private Networks

By default JFrog does not allow private-network webhook targets. Use a public URL (or a
Hookdeck CLI tunnel), or an admin can relax `urlStrictPolicy` in `system.yaml`.

## Test Mode

The **Test** button sends a sample request to the URL. A non-2xx response or a failed token
check shows up in the webhook's **Troubleshooting** tab.
