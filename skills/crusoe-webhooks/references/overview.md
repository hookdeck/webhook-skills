# Crusoe Cloud Webhooks Overview

## What Are Crusoe Cloud Webhooks?

Crusoe Cloud's [Notifications service](https://docs.crusoecloud.com/notifications/overview)
monitors your infrastructure, usage and services. When it detects a significant event
it publishes it to a notification pipeline and routes it to your channels: the
console (always on), email, Slack, and generic webhook endpoints. Webhook and Slack
endpoints are configured in a Svix dashboard reached from the Crusoe Cloud Console.
Typical consumers are PagerDuty, Opsgenie or your own automation.

## Which Crusoe Notification Events Can I Receive?

Crusoe groups events into categories in the **Notification Settings** page. You pick
event types per endpoint in the Svix dashboard; its event catalog is the authoritative
list of exact type strings for your organization.

| Category | Triggered when | Common use cases |
|----------|----------------|------------------|
| Resource Health | Hardware issues and automated remediation on your nodes (Command Center, [AutoClusters](https://docs.crusoecloud.com/orchestration/cmk/autoclusters)) | Page on-call, annotate training runs, track node replacements |
| User Account and Organization Management | Changes to organization account settings and access controls | Audit logging, security alerts |
| Billing | A [budget alert](https://docs.crusoecloud.com/usage-billing/budget-alerts) threshold is exceeded (evaluated daily shortly after midnight UTC) | Spend alerts, pausing workloads |
| Managed AI | Managed AI service updates and issues; [self-serve deployment](https://docs.crusoecloud.com/managed-ai/notifications) status: deployment created, scaled, deleted | Deployment dashboards, inference ops |

The only exact event type string Crusoe documents is:

| Event | Triggered when |
|-------|----------------|
| `resource.automated_remediation` | An automated remediation workflow (for example Node Replacement) runs on a node |

## What Does a Crusoe Webhook Payload Look Like?

Payloads are HTTP POSTs with a JSON body whose structure **varies by event type**.
Crusoe's documented `resource.automated_remediation` example (node replacement):

```json
{
  "status": "started",
  "org_name": "Org ABC 123",
  "org_id": "org-abc123",
  "project_name": "ml-training",
  "project_id": "proj-def456",
  "cluster_name": "training-cluster-prod",
  "cluster_id": "cluster-abc123",
  "resource_type": "VM",
  "resource_name": "worker-node-42",
  "resource_id": "vm-xyz789",
  "location": "us-east1-a",
  "workflow_type": "Node Replacement",
  "triggered_by": {
    "error_name": "XID 79: GPU has fallen off the bus"
  }
}
```

Note there is **no `type` field** in that example, and Svix does not send the event
type in a header. To route events:

- Use `type` / `event_type` if a payload has one.
- Otherwise identify payloads by shape (`workflow_type` + `resource_id` means remediation).
- Or give each category its own endpoint URL in the Svix dashboard.

Treat every field as optional and log unknown shapes rather than failing, so a new
event type never causes retries.

## Full Event Reference

- [Crusoe Cloud Notifications](https://docs.crusoecloud.com/notifications/overview)
- [Managed AI Notifications](https://docs.crusoecloud.com/managed-ai/notifications)
- The **Event Catalog** tab of the Svix dashboard opened from the console
