# Setting Up Plunk Webhooks

## Prerequisites

- A Plunk project with access to **Workflows**
- A publicly reachable endpoint (use `npx hookdeck-cli listen 3000 plunk --path /webhooks/plunk` locally)

## Create the Workflow

1. In the Plunk dashboard open **Workflows** and create a workflow.
2. Pick the trigger event, for example `email.bounce` or `contact.unsubscribed`.
3. Add a **Webhook** step after the trigger.

## Configure the Webhook Step

- **URL:** your endpoint, for example `https://api.example.com/webhooks/plunk`. It needs a static
  `http://` or `https://` scheme.
- **Method:** a literal verb (`GET`, `POST`, `PUT`, `PATCH`, `DELETE`). Default `POST`, which Plunk
  recommends for most cases.
- **Headers:** JSON with the secret header (below).
- **Body (optional):** leave empty for the default `{ contact, workflow, execution, event }` body.

## Add the Secret Header

Plunk recommends authenticating the sender with a secret header on the step, for example:

```json
{
  "Authorization": "Bearer your-shared-secret"
}
```

Store the header name and the **exact, whole value** (including `Bearer ` if you typed it):

```bash
PLUNK_WEBHOOK_HEADER=Authorization
PLUNK_WEBHOOK_SECRET=Bearer your-shared-secret
```

If you use Hookdeck, the Plunk source shows this note, and it applies here too:

> Add a secret header to the webhook step in your workflow and enter it here. Use a static value, not a {{variable}}.

Header values support `{{variable}}` interpolation, but verification needs a fixed value, so
don't put a variable in the secret.

## Hookdeck: Allow Every Method You Use

Hookdeck's Plunk source pre-selects `POST` without managing the method. If the webhook step uses
`GET`, `PUT`, `PATCH` or `DELETE`, allow that method on the source as well, or those requests
won't be accepted.

## Enable and Test

1. Enable the workflow. It sends a request each time the trigger event occurs.
2. Trigger the event, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/plunk \
  -H "Content-Type: application/json" \
  -H "Authorization: $PLUNK_WEBHOOK_SECRET" \
  -d '{"contact":{"email":"user@example.com"},"workflow":{"id":"wf_1","name":"Bounce Notifications"},"execution":{"id":"exec_1"},"event":{"bounceType":"Permanent","bouncedAt":"2025-01-15T10:30:00.000Z"}}'
```

## Network Notes

Plunk egress IPs can change, so don't rely on an IP allowlist. Private and internal addresses
are blocked, so a local server needs a tunnel.
