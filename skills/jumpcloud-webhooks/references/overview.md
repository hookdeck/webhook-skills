# JumpCloud Webhooks Overview

## What Are JumpCloud Webhooks?

JumpCloud can send automated notifications to an external URL when an event happens: a new user
is created, a password is reset, a suspicious login is detected, an access request changes. You
configure a **webhook channel** (Settings > Notification Channels > Webhooks) and attach it to an
alert rule. For Access Requests you pick the events directly under Access > Access Requests.

Requests are not signed. The channel can authenticate with None, Basic (username and password) or
Token, and can add up to 25 custom headers. This skill covers Basic authentication.

## Event Types

JumpCloud does not publish a list of event type strings or `category` values, and the payload has
no `event` field. Each notification is an **alert**: branch on `priority`, `status`, `category` or
`di_event`. Documented enumerations:

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
| `di_event` | DI event associated with the alert |
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

No example body is documented, so any sample payload (including those in this skill's tests) is
illustrative. Use the channel's **Test Webhook** button to see a real request.

## Full Reference

See [Create Webhook Channels](https://jumpcloud.com/support/create-webhook-channels).
