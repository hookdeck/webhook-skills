# PlanetScale Webhooks Overview

## What Are PlanetScale Webhooks?

A PlanetScale webhook sends an HTTP `POST` to a URL you configure when something happens in your PlanetScale organization. They report the life cycle of your database cluster (branches, deploy requests, backups, storage, access requests), not table-level changes: they are not MySQL triggers and do not fire on `INSERT`, `UPDATE` or `DELETE`.

Webhooks belong to a **database** (up to 5 per database). You create them in the dashboard, with the `pscale webhook` CLI command, or with the webhooks API. Each webhook has its own secret.

## Common Event Types

The event name is in the body's `event` field. Handled by the examples:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `webhook.test` | A webhook test is triggered from the dashboard | Confirm the endpoint and secret work |
| `branch.ready` | The branch is created and ready to connect | Run migrations, post connection details to a channel |
| `branch.anomaly` | The branch has a new anomaly in Insights | Page on-call, open a ticket |
| `deploy_request.opened` | The deploy request has been opened | Notify reviewers, link to a ticket |
| `deploy_request.queued` | The deploy request was added to the deploy queue | Track progress in CI |
| `deploy_request.in_progress` | The deploy request has started running | Mark a release as deploying |
| `backup.failed` | A backup has failed | Alert the team |
| `backup.succeeded` | A backup has completed successfully | Record backup health |
| `cluster.storage` | A Postgres database reached a storage threshold (60%, 75%, 85%, 90%, 95%) | Capacity alerts |
| `database.access_request` | PlanetScale staff opens an access request | Notify admins to review it |

Documented but only logged by the examples (the handler's default branch):

| Event | Triggered When | Engines |
|-------|----------------|---------|
| `branch.primary_promoted` | A new primary was promoted for the branch | Postgres |
| `branch.out_of_memory` | A Postgres database had an out of memory event | Postgres |
| `branch.schema_recommendation` | A new schema recommendation was created | Vitess, Neki, Postgres |
| `branch.sleeping` | The branch is now sleeping | Vitess, Neki, Postgres |
| `branch.start_maintenance` | A production branch is about to start maintenance | Vitess, Neki, Postgres |
| `deploy_request.pending_cutover` | The deploy request is ready to cut over and waiting on the user | Vitess |
| `deploy_request.schema_applied` | The deploy request finished applying the schema | Vitess |
| `deploy_request.errored` | The deploy request stopped due to an error | Vitess |
| `deploy_request.reverted` | The deploy request was reverted | Vitess |
| `deploy_request.closed` | The deploy request was closed | Vitess |
| `keyspace.storage` | A Vitess keyspace reached a storage threshold | Vitess |

That is 21 events including `webhook.test`.

## Event Payload Structure

Every delivery has the same envelope:

```json
{
  "timestamp": 1698252899,
  "event": "deploy_request.opened",
  "organization": "myorg",
  "database": "example_database",
  "resource": {
    "id": "4xsz0ql82y4n",
    "type": "DeployRequest",
    "number": 5,
    "branch": "dev",
    "into_branch": "main",
    "state": "open",
    "deployment_state": "pending",
    "html_url": "https://app.planetscale.com/demo-db/example_database/deploy-requests/5"
  }
}
```

- `timestamp`: Unix seconds.
- `resource`: the same shape as the matching API response (a branch, deploy request, backup, ...). `cluster.storage` carries `branch_name`, `storage_percentage` and a `storage` array instead.
- Treat every field as untrusted after verification and check types before reading nested values.

## Delivery

`2xx` within 2 seconds, no redirects followed, repeatedly failing webhooks are disabled. The docs state no retry policy.

## Full Event Reference

For the complete list of events and example payloads, see [PlanetScale's webhook events reference](https://planetscale.com/docs/api/webhook-events) and the [webhooks documentation](https://planetscale.com/docs/api/webhooks).
