# JumpCloud Webhooks Overview

## What Are JumpCloud Webhooks?

JumpCloud can send automated notifications to an external URL when an event happens: a new user
is created, a password is reset, a suspicious login is detected, an access request changes. You
configure a **webhook channel** (Settings > Notification Channels > Webhooks) and attach it to an
alert rule. For Access Requests you pick the events directly under Access > Access Requests.

Requests are not signed. The channel can authenticate with None, Basic (username and password) or
Token, and can add up to 25 custom headers. This skill covers Basic authentication.

## Event Types

The event name is `di_event.event_type`, a Directory Insights type. JumpCloud lists these in
[Insight Alert Events](https://jumpcloud.com/support/create-an-insights-rule#events-insight-alerts)
and [Access Requests Events](https://jumpcloud.com/support/manage-access-requests). Device monitoring
rules such as low disk space aren't on those lists, and `category` values aren't documented, so fall
back to `rule_id` or `category` for them. Documented enumerations:

| Field | Documented values |
|-------|-------------------|
| `priority` | Critical, High, Medium, Low |
| `status` | Open, Acknowledged, Resolved, Auto-Resolved |

## Payload Fields

| Field | Description |
|-------|-------------|
| `alert_id` | ID of the alert |
| `alert_title` | Title of the alert |
| `category` | Category of the alert |
| `description` | Detailed description of the alert |
| `di_event` | DI event associated with the alert, an object carrying `event_type` |
| `event_description` | Description of the event that triggered the alert |
| `in_console_alert` | Alert generated in the JumpCloud console |
| `initiated_by` | User who initiated the change |
| `occurred_at` | When the alert occurred |
| `organization_name` | Name of the organization |
| `previous_alert_status` | Previous status of the alert |
| `priority` | Critical, High, Medium or Low |
| `rule_id` | ID of the rule that triggered the alert |
| `source_id` / `source_name` / `source_type` / `source_url` | The alert source |
| `status` | Open, Acknowledged, Resolved or Auto-Resolved |
| `update_at` | Time of the most recent update |

Access Request details are nested under `di_event`: `workflow.name`, `resource.name`,
`access_request_id`, `access_request_state`, `user_remarks` and more
([Access Requests Webhook Payload Data](https://jumpcloud.com/support/manage-access-requests)).

The only example body is a sample in JumpCloud's
[Azure walk-through](https://jumpcloud.com/support/webhook-use-case-jumpcloud-to-azure-integration-setup),
so any sample payload (including those in this skill's tests) is illustrative. It writes `priority`
and `status` in capitals (`HIGH`, `OPEN`), so compare them without case. Use the channel's
**Test Webhook** button to see a request.

## Full Reference

See [Create Webhook Channels](https://jumpcloud.com/support/create-webhook-channels).
