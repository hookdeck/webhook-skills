# Setting Up dbt Cloud Webhooks

## Prerequisites

- A dbt Cloud account on a Starter or Enterprise plan (multi-tenant or AWS single-tenant)
- Account Admin, Admin, or (Enterprise) Developer permissions
- A public HTTPS endpoint that accepts an `Authorization` header (use `npx hookdeck-cli listen 3000 dbt-cloud --path /webhooks/dbt-cloud` locally)

## Create a Webhook in the UI

1. Click your account name in the left panel, then **Account settings**.
2. Open **Webhooks** and click **Create webhook**.
3. Enter a name and description.
4. Under **Events**, pick one or more of `job.run.started`, `job.run.completed`, `job.run.errored`.
5. Under **Jobs**, choose specific jobs, or leave empty for all jobs in the account.
6. Enter your **Endpoint** URL and click **Save**.
7. Copy the **secret token** that dbt shows and store it as `DBT_CLOUD_WEBHOOK_SECRET`.

## Create a Webhook with the API

```bash
curl -X POST "https://<your-access-url>/api/v3/accounts/<account_id>/webhooks/subscriptions" \
  -H "Authorization: Token $DBT_CLOUD_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "event_types": ["job.run.completed", "job.run.errored"],
    "name": "Webhook for jobs",
    "client_url": "https://example.com/webhooks/dbt-cloud",
    "active": true,
    "description": "Notify on run completion",
    "job_ids": [123]
  }'
```

The response includes `hmac_secret`. Use it as-is: it's a raw string, not base64 or hex encoded.

Other endpoints under `/webhooks/subscription/{webhook_id}`: `GET` (read), `PUT` (update), `DELETE`, and `GET .../test` (sends a test verification request to your endpoint).

## Test Your Endpoint

Check that your endpoint accepts an `Authorization` header:

```bash
curl -H 'Authorization: 123' -X POST https://<your-webhook-endpoint>
```

dbt has no separate ping event. The `test` endpoint reports `verification_status_code` and `verification_error` for your URL.

## Notes

- Test vs live: dbt has no test mode. Create a webhook scoped to a development job.
- Rotating a secret: create a new webhook, switch your endpoint to its secret, then delete the old one.
