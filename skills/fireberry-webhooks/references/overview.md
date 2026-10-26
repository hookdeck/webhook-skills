# Fireberry Webhooks Overview

## What Are Fireberry Webhooks?

Fireberry (CRM, formerly Powerlink) has no standalone webhook subscription. A webhook is an
**action in an automation**: under **Then** you click **+ Add Action** and choose **Webhook**.
Whenever the automation's trigger and **If** filter match a record, Fireberry sends the request you
configured to a third-party URL, for example to post a Slack message each time a lead account is
created. Technical knowledge is required to set one up.

Requests are not signed. You add a secret header to the action and check it on your endpoint.

## What Does a Request Contain?

You define every part of it in the action:

| Part | What you choose |
|------|-----------------|
| Request method | `POST`, `GET`, `PUT`, `DELETE` or `PATCH` |
| URL | Full URL starting with a scheme (`https://` recommended) |
| Header | Any number of key/value pairs (e.g. `Content-Type`, your secret header) |
| Body | Free text, often JSON. Not available for `GET` |

The `{ }` button on the URL, Header and Body boxes inserts **field references** (for example an
account name) from the triggering record.

## Event Types

Fireberry **does not define event types** and adds no `event` field. What your endpoint receives is
exactly the body the automation's author wrote. The examples assume this **illustrative** JSON body,
which you create in the Body box:

| `event` (illustrative) | Meaning in your automation | Common Use Cases |
|------------------------|----------------------------|------------------|
| `account.created` | Automation type Account, When "Account is created" | Sync new leads |
| `record.updated` | Automation fires when a record is updated | Mirror field changes |

```json
{
  "event": "account.created",
  "record": { "id": "a1b2c3", "accountname": "Acme Ltd", "statuscode": "Lead" }
}
```

Hard-code the `event` string in each automation's body so your endpoint can tell them apart.

## Delivery Behaviour

- Fireberry adds a system log to the related record's stream each time a webhook is sent.
- There is no retry. Instead, if the action receives **5 consecutive error responses over more than
  24 hours, or 1,000 consecutive within 24 hours**, the automation is set to **Draft**: it stops completely
  (including its other actions) and an email goes to the creator and the primary system user.

## Full Reference

See [Fireberry's webhook automations article](https://www.fireberry.com/articles/webhook-automations).
