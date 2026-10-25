# Setting Up Factorial Webhooks

## Prerequisites

- A Factorial company, plus an **API key** or OAuth2 access token with access to it
- Your `company_id`
- A publicly reachable **HTTPS** endpoint (use `npx hookdeck-cli listen 3000 factorial --path /webhooks/factorial` locally)

## Set a Challenge

**Set a challenge on the webhook subscription. Without one, Factorial sends nothing to verify.**

The `challenge` is a secret string you choose when creating the subscription. Factorial returns it
unchanged in the `x-factorial-wh-challenge` header of every delivery. Store the same value as
`FACTORIAL_WH_CHALLENGE` in your app. Pick a long random value (for example `openssl rand -hex 24`)
and keep it ASCII.

## Register Your Endpoint

There is no dashboard setup; subscriptions are created through the API. Each subscription has one
`subscription_type`, so create one per event you want.

```bash
curl --request POST \
  --url https://api.factorialhr.com/api/2026-10-01/resources/api_public/webhook_subscriptions \
  --header 'x-api-key: YOUR_API_KEY' \
  --header 'content-type: application/json' \
  --data '{
    "company_id": 157412,
    "subscription_type": "timeoff/leave/create",
    "target_url": "https://yourapp.com/webhooks/factorial?type=timeoff/leave/create",
    "name": "Leave requests",
    "challenge": "YOUR_LONG_RANDOM_CHALLENGE",
    "enabled": true
  }'
```

| Field | Required | Notes |
|-------|----------|-------|
| `subscription_type` | Yes | e.g. `employees/employee/create_with_contract`, `timeoff/leave/create`, `ats/application/create` |
| `target_url` | Yes | Public HTTPS URL |
| `company_id` | Yes | Your company ID |
| `challenge` | No, but set it | Echoed in `x-factorial-wh-challenge` |
| `name`, `enabled`, `api_version` | No | `api_version` fixes the payload shape |

The response includes the subscription `id`; keep it to enable, disable or delete it later
(`PUT` / `DELETE` on `.../webhook_subscriptions/{id}`).

The `?type=` suffix on `target_url` is a convention of the skill examples (the body has no event
field, so it tells the handler which subscription fired). Factorial doesn't require it.

## Permissions

A subscription only receives payloads its creating token may see. Use an API key or company token
rather than a user token, or events for other employees will be missing.

## Test

Perform the real action in Factorial (for example submit a leave request); an API write that
bypasses the action may not fire the event. Or replay with curl:

```bash
curl -X POST "http://localhost:3000/webhooks/factorial?type=timeoff/leave/create" \
  -H "Content-Type: application/json" \
  -H "x-factorial-wh-challenge: $FACTORIAL_WH_CHALLENGE" \
  -d '{"id":42,"employee_id":2,"start_on":"2026-11-02","finish_on":"2026-11-06"}'
```

## Disabled Subscriptions

After 20 failed attempts or 48 hours, Factorial disables the subscription. Fix the endpoint, then
`PUT` `{"enabled": true}` to the same subscription. Set a technical support contact under
**Settings > API Notifications** so failure emails reach the right team.
