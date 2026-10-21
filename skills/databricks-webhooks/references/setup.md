# Setting Up Databricks Webhooks

## Prerequisites

- A Databricks workspace and **workspace admin** access (only admins manage notification destinations)
- A public HTTPS endpoint with a certificate signed by a trusted CA (Databricks enforces HTTPS)
- Your endpoint URL, for example `https://your-domain.com/webhooks/databricks`

## Create the Webhook Destination

1. Click your username in the top bar of the workspace and select **Settings**.
2. In the **Workspace admin** section, open the **Notifications** tab.
3. Click **Manage**, then **+Add destination**.
4. Select the destination type **Webhook**.
5. Enter your endpoint URL.
6. Enter a **username and password** for HTTP Basic authentication. Use a different credential for each destination so you can revoke one without affecting others.
7. Click **Create**.

Set the same values as `DATABRICKS_WEBHOOK_USERNAME` and
`DATABRICKS_WEBHOOK_PASSWORD` in your receiver. (The OAuth Beta option uses a
client ID, client secret, and token endpoint instead, and cannot be combined
with Basic auth.)

## Attach the Destination

- **Jobs:** open the job, add a notification, choose the Webhook destination, and select the events (start, success, failure, duration warning). Webhooks can be set on jobs or tasks.
- **SQL alerts:** add the destination as a notification on the alert; it fires on state changes.

## Network Allowlist

If your endpoint is behind a firewall, allowlist the workspace control plane
webapp IPs and the data plane outbound IPs for your region (from the
`ip-ranges.json` file Databricks publishes: service `Databricks`, platform
`aws`, type `outbound`). Databricks may change these as often as every 30 days.

## Test

Trigger a job run or alert, or send a request manually:

```bash
curl -X POST https://your-domain.com/webhooks/databricks \
  -u "your_destination_username:your_destination_password" \
  -H "Content-Type: application/json" \
  -d '{"event_type":"jobs.on_success","workspace_id":"123","run":{"run_id":"1"},"job":{"job_id":"2","name":"nightly"}}'
```

Local development: `npx hookdeck-cli listen 3000 databricks --path /webhooks/databricks`
