# Setting Up Autotask Webhooks

## Prerequisites

- Autotask REST API 1.0+ (or SOAP 1.6+) access with an **API-only** security level that has **Can create WebHooks** enabled
- A public HTTPS endpoint (a Webhook URL) and a second **Deactivation URL** (notified when the webhook is deactivated or deleted)
- Your API zone URL, `https://webservices[n].autotask.net`

## Allow Webhook Creation

1. Go to Admin > Company Settings & Users > Resources/Users (HR) > Security > Security Levels.
2. Copy the *API User (system) (API-only)* level (or another API User level).
3. In the **Other** section, tick **Can create WebHooks** and set the maximum number of webhooks.
4. Assign that security level to the integration's API resource.

Webhooks are disabled by default for every security level.

## Create the Webhook (and Choose Your Secret)

The signing secret is the `SecretKey` you choose when creating the webhook. It is not generated for you. Use up to 64 characters (at least 10 recommended).

```
POST https://webservices[n].autotask.net/atservicesrest/v1.0/CompanyWebhooks
{
  "IsActive": true,
  "Name": "Company Update Webhook",
  "WebhookUrl": "https://your-app.example.com/webhooks/autotask",
  "DeactivationUrl": "https://your-app.example.com/webhooks/autotask",
  "IsSubscribedToUpdateEvents": true,
  "SecretKey": "ahywqn676nwh8",
  "SendThresholdExceededNotification": false,
  "NotificationEmailAddress": "you@example.com"
}
```

The response is `{ "itemId": 4 }`. Use the same pattern for `ContactWebhooks`, `TicketWebhooks` and the other supported entities.

## Add Trigger Fields

Look up field IDs with `GET .../CompanyWebhookFields/entityInformation/fields`, then add each field:

```
POST .../CompanyWebhooks/4/Fields
{ "FieldID": 7, "IsSubscribedField": true, "IsDisplayAlwaysField": true, "WebhookID": 4 }
```

`IsSubscribedField` makes a change to the field fire the webhook; `IsDisplayAlwaysField` always includes it in the payload. At least one field or UDF is required for Create and Update callouts. Use `<Entity>WebhookExcludedResources` to stop your own API user triggering loops.

## Test

Set `AUTOTASK_WEBHOOK_SECRET` to the same `SecretKey`, then change a subscribed field on a record. The Webhooks list at Admin > Extensions & Integrations > Other Extensions & Tools > Webhooks shows the webhook (read-only).
