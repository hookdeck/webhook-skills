# Setting Up Fireberry Webhooks

## Prerequisites

- A Fireberry account that can create automations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 fireberry --path /webhooks/fireberry` locally)
- A long random secret to use as the header value (for example `openssl rand -hex 32`)

## Add the Webhook Action

1. Create or open an automation (for example Type **Account**, When **Account is created**, If
   **Status** equals **Lead**).
2. Under **Then**, click **+ Add Action** and select **Webhook**. A panel opens on the right.
3. **Request Method:** pick one of `POST`, `GET`, `PUT`, `DELETE`, `PATCH`. The handler in this skill
   accepts all five. If you receive via Hookdeck, note its Fireberry source pre-selects only
   `POST`, so allow any other method you pick on the source.
4. **URL:** your endpoint, e.g. `https://example.com/webhooks/fireberry`.
5. **Header:** click **+ Add Header** for each pair:
   - `Content-Type` = `application/json`
   - your secret header, e.g. key `Authorization`, value `Bearer <your secret>`
6. **Body** (not shown for `GET`): write the JSON you want. Use the `{ }` button to insert field
   references from the record (Fireberry supplies the exact reference text), and include an event
   label of your own, e.g. `"event": "account.created"`. The result looks like:

   ```json
   {"event": "account.created", "record": {"id": "a1b2c3", "accountname": "Acme Ltd"}}
   ```
7. Save and activate the automation.

## Configure the Endpoint

```bash
FIREBERRY_WEBHOOK_HEADER=Authorization
FIREBERRY_WEBHOOK_SECRET="Bearer <your secret>"
```

`FIREBERRY_WEBHOOK_HEADER` is the header **key** you typed. `FIREBERRY_WEBHOOK_SECRET` is the
**exact whole value**, including any `Bearer ` prefix. The handler does not strip or parse it.
Avoid secrets with unusual characters that the header box might alter.

## Test

Trigger the automation (create a matching record) and check the record's stream for the webhook
system log, or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/fireberry \
  -H "Content-Type: application/json" \
  -H "Authorization: $FIREBERRY_WEBHOOK_SECRET" \
  -d '{"event":"account.created","record":{"id":"a1b2c3","accountname":"Acme Ltd"}}'
```

## If the Automation Goes to Draft

Consecutive error responses (5 over more than 24 hours, or 1,000 consecutive within 24 hours) set the
automation to **Draft** and stop all its actions. Fix the cause (usually a wrong
`FIREBERRY_WEBHOOK_SECRET` returning 401, or a handler error), then re-activate the automation.

## Network Notes

The articles list no sender IP range, so an IP allowlist is not an option. Use the secret header
and HTTPS.
