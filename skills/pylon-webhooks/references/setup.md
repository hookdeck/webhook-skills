# Setting Up Pylon Webhooks

## Prerequisites

- A Pylon account with access to **Settings > Integrations & dev**.
- Your application's public webhook URL (for example
  `https://your-app.com/webhooks/pylon`). For local development, use the Hookdeck
  CLI tunnel (see below).

## Create the Webhook

1. Go to **Settings > Integrations & dev > Webhooks** and click **Create Webhook**.
2. Enter a **Name** and the **Target URL**.
3. Pick the **HTTP method**. POST is the default; GET, PUT, PATCH and DELETE are
   also available. Keep a body-carrying method (POST, PUT or PATCH) so the signed
   body reaches your handler intact.
4. Optionally add **Custom headers**, for example an `Authorization` header. Turn on
   **Secret** for a header to encrypt its value and hide it after saving.
5. Click **Create** and **copy the webhook secret**. Pylon shows it only once.

The secret can't be viewed again or rotated. To replace it, create a new webhook,
point your triggers at it, and delete the old one.

```bash
PYLON_WEBHOOK_SECRET=<the-secret-shown-once>
```

## Send It From a Trigger or Macro

1. Go to **Settings > Workflows > Triggers** and create a trigger with a **Send
   webhook** action (macros can send webhooks too).
2. Use the trigger's conditions to control when the webhook fires.
3. Write the request body in **JSON payload**. Type `{` to insert variables such as
   `{{ issue.id }}`. See [overview.md](overview.md) for the template rules.

## Test

Click **Test** in the edit dialog of the **saved** webhook. It sends
`{"data":{"type":"ping"}}`, signed. Tests sent from the **create** dialog are
**unsigned**, because the secret doesn't exist yet, so they fail verification.

## Local Development

Forward deliveries to localhost with the Hookdeck CLI:

```bash
npx hookdeck-cli listen 3000 pylon --path /webhooks/pylon
```

Put the URL Hookdeck prints into the webhook's Target URL, save it, then click
**Test** from Edit.

## Monitoring

The **Logs** tab on the Webhooks page lists every attempt, including retries, with
status, method, payload, response, duration and request ID. Payloads and responses
over about 65 KB are truncated in the log.
