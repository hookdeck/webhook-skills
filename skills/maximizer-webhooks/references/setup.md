# Setting Up Maximizer Webhooks

## Prerequisites

- A Maximizer CRM instance, and a token for a user with the **Administrator** role (an Octopus
  regular or personal access token, or an OAuth token)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 maximizer --path /webhooks/maximizer` locally)

## Choose Your Secret

Maximizer does not give you a signing secret. Make one: a long random string, and pick the header
name that will carry it.

```bash
export MAXIMIZER_WEBHOOK_HEADER=Authorization
export MAXIMIZER_WEBHOOK_SECRET="Bearer $(openssl rand -hex 32)"
```

The handler compares the **whole** header value, so `MAXIMIZER_WEBHOOK_SECRET` must match what you
put in the target exactly, including a `Bearer ` prefix if you use one. You can use any header name
(for example `X-Maximizer-Auth`) and drop the prefix.

## Register Your Endpoint (Create a Target)

`POST https://api.maximizer.com/webhooks/v1/targets` with your admin token:

```json
{
  "Name": "My app",
  "Endpoint": {
    "Url": "https://example.com/webhooks/maximizer",
    "Headers": [
      { "Key": "Authorization", "Value": "Bearer <the same secret>" }
    ]
  }
}
```

The target URL may include query parameters. There is a limit of 10 targets per instance. Note the
target `Id` in the `201 Created` response.

## Subscribe to Events

`POST https://api.maximizer.com/webhooks/v1/subscriptions` for each `Entity` and `Op` you want
(the combination of target + `Entity` + `Op` must be unique), with the target's `Id`:

```json
{ "TargetId": "<target id>", "Entity": "Opportunity", "Op": "Update" }
```

Recommended starting set: `AbEntry`, `Opportunity` and `Lead`, each with `Create`, `Update` and
`Delete`. Subscriptions can also take simple filters (for example `$EQ`, `$GT`); filters are AND-ed.
See the Webhooks Postman collection linked from the docs for the exact request shape.

## Test

Replay a captured webhook with curl:

```bash
curl -X POST http://localhost:3000/webhooks/maximizer \
  -H "Content-Type: application/json" \
  -H "$MAXIMIZER_WEBHOOK_HEADER: $MAXIMIZER_WEBHOOK_SECRET" \
  -d '[{"Id":"1","Entity":"Opportunity","Data":{"Op":"Update","Original":{"Key":"k"},"New":{"Key":"k"},"Version":"1.1"}}]'
```

## Rotating the Secret

Update the target (`PUT /v1/targets/{id}`) with the new header value and change
`MAXIMIZER_WEBHOOK_SECRET` at the same time. Requests sent between the two changes get `401` and
are retried by Maximizer (two more attempts), so make the change quickly or briefly accept both.
