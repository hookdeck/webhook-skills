# Terraform Webhooks Overview

## What Are HCP Terraform Notification Webhooks?

HCP Terraform (formerly Terraform Cloud) and Terraform Enterprise can notify
external systems about run progress and other workspace events. A workspace holds up
to 20 notification configurations. Each one has a destination, an optional token,
and the triggers that should fire it.

The **generic** destination POSTs a JSON payload to your URL and, when a token is
set, signs it with `X-TFE-Notification-Signature`. Slack, Microsoft Teams, and email
destinations use their own formats and are not covered here. Speculative plans and
workspaces with Local execution mode don't send notifications.

Configurations also exist at project level (applying to every workspace in the
project) and team level (change requests).

## Common Event Types

| Trigger | Triggered When | Common Use Cases |
|---------|----------------|------------------|
| `run:created` | A run is created and enters Pending | Track run queue |
| `run:planning` | A run acquires the lock and starts | Update dashboards |
| `run:needs_attention` | Plan has changes and needs approval or policy override | Ping an approver |
| `run:applying` | A run enters the Apply stage | Change-freeze tracking |
| `run:completed` | A run completes successfully | Kick off downstream deploys |
| `run:errored` | A run ends early from an error or cancellation | Alert on-call |
| `assessment:drifted` | Drift detected (health assessments on) | Open a drift ticket |
| `assessment:check_failure` | Continuous validation checks failed | Alert owners |
| `assessment:failed` | A health assessment failed | Investigate assessment logs |
| `workspace:auto_destroy_reminder` | Automatic destroy run is imminent (12 and 24 hours ahead) | Warn owners |
| `workspace:auto_destroy_run_results` | Automatic destroy run attempted | Report outcome |
| `workspace:deleted` | A workspace is deleted | Clean up references |
| `team:change_request` | Change request sent to a workspace the team can access | Route to a team |
| `verification` | Test request on enable / "Send a test" | Return 2xx |

Health assessments need the HCP Terraform Standard or Premium edition.

## Event Payload Structure

There are three payload shapes.

**Run events** (`payload_version: 1`):

```json
{
  "payload_version": 1,
  "notification_configuration_id": "nc-AeUQ2zfKZzW9TiGZ",
  "run_url": "https://app.terraform.io/app/acme-org/my-workspace/runs/run-FwnENkvDnrpyFC7M",
  "run_id": "run-FwnENkvDnrpyFC7M",
  "run_message": "Add five new queue workers",
  "run_created_at": "2019-01-25T18:34:00.000Z",
  "run_created_by": "sample-user",
  "workspace_id": "ws-XdeUVMWShTesDMME",
  "workspace_name": "my-workspace",
  "organization_name": "acme-org",
  "notifications": [
    {
      "message": "Run Canceled",
      "trigger": "run:errored",
      "run_status": "canceled",
      "run_updated_at": "2019-01-25T18:37:04.000Z",
      "run_updated_by": "sample-user"
    }
  ]
}
```

`notifications` is always a single event today, but treat it as a list: HCP
Terraform may roll several into one request in future.

**Workspace events** (`payload_version: "2"`; assessment and auto destroy) have no
`notifications` array. They carry `notification_configuration_url`, `trigger_scope`
(`assessment` or `workspace`), `trigger`, `message`, and `details`. For assessments,
`details` has `new_assessment_result`, `prior_assessment_result`, `workspace_id`,
`workspace_name`, and `organization_name`.

**Change requests** have `change_request_url`, `change_request_subject`,
`change_request_message`, `change_request_created_at`, and `change_request_created_by`
alongside the workspace fields, and no trigger field.

The **verification** payload is a run payload with `null` run and workspace fields
and `notifications[0].trigger` of `"verification"`.

## Full Event Reference

For the complete list, see [HCP Terraform's notification documentation](https://developer.hashicorp.com/terraform/cloud-docs/workspaces/settings/notifications) and the [Notification configurations API](https://developer.hashicorp.com/terraform/cloud-docs/api-docs/notification-configurations).
