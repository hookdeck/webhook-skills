# Setting Up Opsgenie Webhooks

Opsgenie is end-of-sale and Atlassian support ends in April 2027. These steps apply to existing
Opsgenie sites.

## Prerequisites

- An Opsgenie account with permission to manage integrations
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 opsgenie --path /webhooks/opsgenie` locally)

## Choose Your Secret

Opsgenie does not generate a signing secret. You invent one:

1. Pick a header name, e.g. `X-Opsgenie-Secret` (or use `Authorization`).
2. Generate a long random value, e.g. `openssl rand -hex 32`.
3. Store the name as `OPSGENIE_WEBHOOK_HEADER` and the value as `OPSGENIE_WEBHOOK_SECRET`.

If you use `Authorization` with a `Bearer ` prefix, the secret is the **whole value**,
`Bearer <random>`. The handler compares it as-is and does not strip the prefix.

## Register Your Endpoint

1. Go to **Settings > Integrations**.
2. Select **Add integration**, search for **Webhook**, and select it.
3. Name the integration. Optionally pick an **Assignee team**. Select **Continue**.
4. Enter your webhook URL (e.g. `https://example.com/webhooks/opsgenie`).
5. Add the custom header from the step above, with the exact name and value.
6. Under **Post to Webhook URL for Opsgenie alerts**, map the alert actions you want to receive
   (for example "If alert is created in Opsgenie" and "post to url").
7. Select **Turn on integration**. Mappings only fire while the integration is on.

Notes from the Opsgenie docs:

- "A tag is added to the alert" and "a custom action is executed on alert" mappings take an extra
  field: the tags (comma-separated, empty for any tag) or the custom action name.
- An Opsgenie action mapped to more than one "post to URL" in the same integration is an error,
  except for the tag and custom-action mappings.
- Alert description and details can be sent only for Create and custom actions.

## Test

Create a test alert in Opsgenie and check that your endpoint logs the `Create` action. Or replay
with curl:

```bash
curl -X POST http://localhost:3000/webhooks/opsgenie \
  -H "Content-Type: application/json" \
  -H "$OPSGENIE_WEBHOOK_HEADER: $OPSGENIE_WEBHOOK_SECRET" \
  -d '{"action":"Create","alert":{"alertId":"052652ac","message":"test alert"},"source":{"name":"web","type":"API"}}'
```

## Network Notes

Atlassian publishes an outbound traffic static IP list for Opsgenie, which you may use as an
additional filter, but the secret header is the primary check.
