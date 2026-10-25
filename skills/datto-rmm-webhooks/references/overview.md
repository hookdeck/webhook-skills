# Datto RMM Webhooks Overview

## What Are Datto RMM Webhooks?

Datto RMM can send outbound webhooks for monitor alerts to third-party tools such as
ServiceNow, Freshdesk, Slack or Microsoft Teams. This skill covers **Global Webhooks**
(Setup > Integrations > Global Webhooks), which apply to alerts at the priorities you select
across all monitors. Enabling Global Webhooks automatically disables webhooks set on individual
monitors.

Requests are `POST`. They are **not signed**. To authenticate them, add a custom header with a
secret value to the Global Webhook and check it on your endpoint. Per-monitor webhooks have no
header field, so they can't carry a secret.

## Alert Raised and Alert Resolved

| Webhook | Sent When |
|---------|-----------|
| Alert raised | An alert is raised at one of the selected alert priorities |
| Alert resolved (optional) | An alert resolves, if **When alert is resolved** is turned on. Per Datto's monitor webhook docs, only automatically resolved alerts send it; manually resolved alerts do not |

Each has its own payload template. Both go to the same URL, and neither carries an event field
unless you put one in the template.

## Body Is Your Template

The body is a message you author, with `[variable]` placeholders that Datto RMM substitutes.
Content type is one of `application/json` (default), `text/plain` or
`application/x-www-form-urlencoded`. Maximum payload size is 64 KB. Datto also offers Microsoft
Teams and Slack templates in the payload drop-down.

Variables (from Datto's webhook docs):

| Variable | Value |
|----------|-------|
| `[device_id]`, `[device_uid]` | Device ID / unique identifier |
| `[device_hostname]` or `[hostname]` | Hostname |
| `[device_os]` or `[os]` | Operating system |
| `[device_description]` or `[description]` | Device description |
| `[device_ip]` or `[ip]` | External IP address |
| `[device_udf1]` - `[device_udf30]` | User-defined fields |
| `[last_user]` or `[lastuser]` | Last logged-in user |
| `[site_id]`, `[site_uid]` | Site ID |
| `[sitename]` or `[site_name]` | Site name |
| `[alertuid]` or `[alert_uid]` | Alert ID |
| `[alert_type]` or `[type]` | Alert type (for example memory or disk usage) |
| `[alert_category]` or `[category]` | Alert category (for example performance or event log) |
| `[platform]` | Datto RMM platform |
| `[alert]` | Trigger details of the monitor |
| `[alert_message]` or `[alert_message_en]` | Alert message in English (`_de`, `_fr` also exist) |

## Illustrative Payload

Because the vendor adds no event field, the examples assume you write a `status` field into each
template. **This is an illustration, not a vendor schema:**

```json
{
  "status": "raised",
  "alert_uid": "[alert_uid]",
  "alert_type": "[alert_type]",
  "alert_category": "[alert_category]",
  "alert_message": "[alert_message]",
  "device_hostname": "[device_hostname]",
  "site_name": "[site_name]"
}
```

The handlers dispatch on `status`: `raised` and `resolved`. Any other body is acknowledged and
logged as unhandled. Non-JSON bodies (`text/plain`, form-encoded) are accepted too.

## Full Reference

- [Global Webhooks](https://rmm.datto.com/help/en/Content/3NEWUI/Setup/Integrations/GlobalWebhooks.htm)
- [Webhooks (variables, payloads)](https://rmm.datto.com/help/en/Content/3NEWUI/Monitors/Webhooks.htm)
