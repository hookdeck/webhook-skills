# Setting Up Gorgias Webhooks (HTTP Integrations)

## Prerequisites

- A Gorgias account on any Helpdesk plan
- The **account owner or an admin** role (only they can manage HTTP integrations)
- A public HTTPS URL for your endpoint (use the Hookdeck CLI locally, below)

## Generate a Shared Secret

Gorgias doesn't issue a signing secret. Generate your own random secret:

```bash
openssl rand -hex 32
```

Put it in your app's `.env` as `GORGIAS_WEBHOOK_SECRET`.

## Create the Integration in the Gorgias UI

Create **one integration per trigger** so your endpoint knows which event
fired (see [overview.md](overview.md)).

1. In your helpdesk, click the **Settings** icon (bottom left).
2. Under **Account**, select **HTTP integration**.
3. Open the **Manage** tab and click **Add HTTP integration**.
4. **Integration name**: e.g. `My app – ticket created`.
5. **URL**: your endpoint, e.g. `https://example.com/webhooks/gorgias`.
6. **HTTP Method**: `POST`.
7. **Request content type**: `application/json`.
8. **Request body**: the template, with the trigger name hard-coded:

   ```json
   {
     "event": "ticket-created",
     "ticket_id": "{{ticket.id}}",
     "subject": "{{ticket.subject}}",
     "status": "{{ticket.status}}",
     "channel": "{{ticket.channel}}",
     "customer_email": "{{ticket.customer.email}}",
     "assignee_email": "{{ticket.assignee_user.email}}",
     "updated_datetime": "{{ticket.updated_datetime}}",
     "message_text": "{{ticket.messages[-1].body_text}}"
   }
   ```

9. **Header**: add the key `Authorization` with the value
   `Bearer <your GORGIAS_WEBHOOK_SECRET>`.
10. **Triggers**: select **Ticket created** only.
11. Click **Add integration**.

Repeat for each other trigger you need (`ticket-updated`,
`ticket-message-created`, …), changing the `event` value.

## Create the Integration With the API

The same integration via `POST /api/integrations` (authenticate with your
Gorgias REST API username and API key from Settings → REST API):

```bash
curl -X POST "https://<your-domain>.gorgias.com/api/integrations" \
  -u "$GORGIAS_API_USER:$GORGIAS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "My app – ticket created",
    "type": "http",
    "http": {
      "url": "https://example.com/webhooks/gorgias",
      "method": "POST",
      "headers": { "Authorization": "Bearer <your GORGIAS_WEBHOOK_SECRET>" },
      "form": {
        "event": "ticket-created",
        "ticket_id": "{{ticket.id}}",
        "subject": "{{ticket.subject}}",
        "status": "{{ticket.status}}",
        "customer_email": "{{ticket.customer.email}}",
        "updated_datetime": "{{ticket.updated_datetime}}"
      },
      "triggers": { "ticket-created": true },
      "request_content_type": "application/json",
      "response_content_type": "application/json"
    }
  }'
```

`form` holds the body (a JSON object for `application/json`, key-value pairs
for `application/x-www-form-urlencoded`).

## Test It Locally

```bash
# Express or Next.js
npx hookdeck-cli listen 3000 gorgias --path /webhooks/gorgias
# FastAPI
npx hookdeck-cli listen 8000 gorgias --path /webhooks/gorgias
```

Paste the HTTPS URL the CLI prints into the integration's **URL** field,
then trigger the event in Gorgias: create a test ticket, or add a tag to one
(a `ticket-updated` event).

## Check Delivery

Settings → Account → HTTP integration → **Manage** → select the
integration → **Events** tab lists the latest requests. Click one for
details.

If Gorgias disabled the integration (500 consecutive failures), fix the
endpoint and re-enable it on the same page.

## Test Mode vs Live Mode

Gorgias has no test mode for HTTP integrations. Every matching ticket event
in the account fires the integration. Use a separate integration pointed at
your development tunnel, and delete it when you're done.
