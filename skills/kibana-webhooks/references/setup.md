# Setting Up Kibana Webhooks

## Prerequisites

- A Kibana space where you can create connectors and rules
- A publicly reachable HTTPS endpoint (locally: `npx hookdeck-cli listen 3000 kibana --path /webhooks/kibana`)

## Hookdeck Setup

Choose Basic authentication on the Kibana Webhook connector.

Hookdeck's Kibana source pre-selects POST without managing the method, so if the connector uses
PUT, PATCH, GET or DELETE, allow that method on the source too. Hookdeck never sends a 401
challenge (no `WWW-Authenticate` round trip), so the credentials must arrive with each request.
Custom headers and OAuth 2.0 are not covered by Hookdeck's Kibana source.

## Create the Connector

1. In Kibana go to **Stack Management > Connectors** and create a **Webhook** connector (not
   Webhook - Case Management).
2. Set the **Method** (`POST` by default; `PUT` also exists, and `PATCH`, `GET` and `DELETE` are
   generally available since 9.3) and the **URL** (e.g. `https://example.com/webhooks/kibana`).
3. Under **Authentication** choose **Basic authentication** and enter a user name and password.
4. Store them as `KIBANA_WEBHOOK_USERNAME` and `KIBANA_WEBHOOK_PASSWORD`. Use a long random
   password.

## Add a Rule Action

Add the connector as an action on an alerting rule. The **Body** is a mustache template, for
example:

```json
{"rule": "{{rule.name}}", "status": "{{alert.actionGroup}}", "context": "{{context.message}}"}
```

## Test

```bash
curl -X POST http://localhost:3000/webhooks/kibana \
  -u "$KIBANA_WEBHOOK_USERNAME:$KIBANA_WEBHOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"rule":"High CPU","status":"query matched","context":"CPU above 90%"}'
```

(Illustrative payload.) Without `-u` you should get `401`.

## Notes

- The credential is static and shared: use HTTPS and rotate it if it leaks. See
  [verification.md](verification.md).
- Changing the password in Kibana means updating `KIBANA_WEBHOOK_PASSWORD` too, or every request
  returns 401.
