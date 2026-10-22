# Setting Up Honeybadger Webhooks

## Prerequisites

- A Honeybadger account on the Team, Business or Enterprise plan
- Administrative privileges on the project
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 honeybadger --path /webhooks/honeybadger` locally)

## Get Your Token

1. Open the project in Honeybadger and go to **Project Settings**.
2. Open the **API Key** tab.
3. Copy the token shown there and store it as `HONEYBADGER_TOKEN`.

The token is derived from the project API key. **It changes if you reset the API key**, so update
`HONEYBADGER_TOKEN` at the same time or every webhook will start failing with 401.

## Register Your Endpoint

1. Go to **Project Settings > Alerts & Integrations**.
2. Below the personal alert integrations, select the **Webhook** integration.
3. Enter your URL, including the protocol (e.g. `https://example.com/webhooks/honeybadger`).
4. Leave the **Bearer token** field blank. It only adds an `Authorization: Bearer` header for
   services that insist on one; this skill checks `Honeybadger-Token`, which is always sent.
5. Save. Honeybadger posts to the URL when events occur in the project.

## Test

Trigger a test error in the project and check
that your endpoint logs the `occurred` event. Or replay with curl:

```bash
curl -X POST http://localhost:3000/webhooks/honeybadger \
  -H "Content-Type: application/json" \
  -H "Honeybadger-Token: $HONEYBADGER_TOKEN" \
  -d '{"event":"occurred","message":"[App/test] RuntimeError - oops","fault":{"id":1,"klass":"RuntimeError"}}'
```

## Network Notes

Webhooks come from a dynamic IP range, so an IP allowlist is not an option. Use the
`Honeybadger-Token` header instead.
