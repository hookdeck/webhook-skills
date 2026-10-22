# Setting Up Workable Webhooks

## Prerequisites

- A Workable account with API access (an account API token, or an OAuth application)
- A publicly reachable HTTPS endpoint (use `npx hookdeck-cli listen 3000 workable --path /webhooks/workable` locally)

## Get Your Signing Key

There is no separate webhook secret. The key that signs deliveries is:

- the **account API token** that created the subscription (account-token integrations), or
- the **OAuth application secret** (OAuth integrations).

Use it as a raw string. Store it as `WORKABLE_SIGNING_KEY`.

## Register Your Endpoint

Subscriptions are created through the API, not a dashboard form. Authenticate with the same token and call:

```bash
curl -X POST "https://YOUR_SUBDOMAIN.workable.com/spi/v3/subscriptions" \
  -H "Authorization: Bearer $WORKABLE_SIGNING_KEY" \
  -H "Content-Type: application/json" \
  -d '{"target": "https://example.com/webhooks/workable", "event": "candidate_created", "args": {"account_id": "YOUR_ACCOUNT_ID"}}'
```

Check the exact request fields (and the optional `job_shortcode` / `stage_slug` filters) on the [subscriptions endpoint reference](https://workable.readme.io/reference/webhook-subscriptions-candidates-employees). Create one subscription per event, for example `candidate_created`, `candidate_moved`, `employee_created`, `employee_updated`, `employee_published`.

## Testing

Create a candidate or move one between stages in a test job and watch the delivery arrive. Respond `200` quickly.
