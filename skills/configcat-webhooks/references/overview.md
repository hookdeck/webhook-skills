# ConfigCat Webhooks Overview

## What Are ConfigCat Webhooks?

ConfigCat is a feature flag and remote configuration service. A ConfigCat webhook calls a URL you choose whenever a setting (feature flag) changes in a chosen **Config** and **Environment**, so your applications can refresh almost immediately instead of waiting for the next poll.

Each webhook has a URL, an HTTP method (**GET** or **POST**), optional custom headers and an optional request body. Failed deliveries (a non-2XX response or a network error) are retried up to 5 times with variable delays. No timeout is documented, so respond quickly. `X-ConfigCat-Webhook-ID` "is different for every request" and the payload has no change ID, so make processing idempotent (re-read config state) rather than deduping on an ID.

## Common Event Types

ConfigCat has **no event types**: no event header and no event field. Every call means "settings changed" in the Config and Environment the webhook is attached to.

| Call | Triggered When | Common Use Cases |
|------|----------------|------------------|
| Webhook request (any body) | A setting changes and the changes are saved and published | Refresh a ConfigCat client, clear a cache, notify a channel |

## Event Payload Structure

The body is whatever the webhook author writes. ConfigCat replaces these placeholders at send time:

| Placeholder | Replaced with |
|-------------|---------------|
| `##ConfigName##`, `##ConfigId##` | The Config where the change happened |
| `##EnvironmentName##`, `##EnvironmentId##` | The Environment where the change happened |
| `##URL##` | A link to the Config in the dashboard |
| `##ChangeNotes##` | The mandatory notes added to the changeset |
| `##ChangedBy##` | Name and email of the user who made the change |
| `##ChangeDetails##` | JSON array of `{ settingKey, event, details }` |
| `##ChangeDetailsTeams##`, `##ChangeDetailsSlack##` | Change details formatted for Microsoft Teams or Slack |

An illustrative JSON template (yours may differ):

```json
{
  "config": "##ConfigName##",
  "environment": "##EnvironmentName##",
  "notes": "##ChangeNotes##",
  "changes": ##ChangeDetails##
}
```

With **GET** there is no body, and with no body template the request is empty. The example handlers parse JSON if it parses, else treat the body as text, or empty, and log a "settings changed" notification.

## Headers

`X-ConfigCat-Webhook-ID` (unique per request), `X-ConfigCat-Webhook-Timestamp` (Unix seconds) and `X-ConfigCat-Webhook-Signature-V1` (base64 HMAC-SHA256 per signing key).

## Full Event Reference

See [ConfigCat's webhook documentation](https://configcat.com/docs/advanced/notifications-webhooks/).
