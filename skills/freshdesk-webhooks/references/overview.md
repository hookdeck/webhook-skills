# Freshdesk Webhooks Overview

## What Are Freshdesk Webhooks?

In Freshdesk, a webhook is an **action in an automation rule**, not an event
subscription. Freshdesk's docs say: "a webhook lets you make an API call as part
of an automation action. Webhooks use the Agent API, so they are treated as an
agent performing an update."

You create a rule, set its conditions, and add a **Trigger Webhook** action.
When a ticket matches, Freshdesk sends the HTTP request you configured:

| Setting | Options |
|---|---|
| Callback Request Type | `GET`, `POST`, `PUT`, `PATCH`, `DELETE` |
| Callback URL | Any URL. Placeholders are allowed, e.g. `https://example.com/webhooks/freshdesk?ticket={{ticket.id}}` |
| Requires authentication | Toggle that asks for an API key. Freshdesk doesn't document the wire format |
| Add custom headers | One `Header-Name: VALUE` per line |
| Encoding | JSON, XML or XML-Encoded |
| Content | **Simple** (pick ticket properties) or **Advanced** (write the body with placeholders) |

The related **Trigger API** action (Pro plan and up) is for calls whose
*response* Freshdesk should use in later automations. It's not a webhook to
your app, so this skill doesn't cover it.

## Which Rules Can Trigger a Webhook?

Freshdesk's article covers two rule tabs:

- **Ticket Creation**: runs when a ticket is created.
- **Ticket Updates**: runs when a ticket is updated. Typical conditions are
  "Customer replies to ticket", "Status is updated" and "Customer feedback is
  received".

Some accounts also have time-based automations (time triggers). The webhook
article doesn't cover them, so check your account before relying on them.

## Event Types (this skill's convention)

Freshdesk sends no event-type field, so the Advanced payload in this skill sets
one. Each rule hard-codes an `event` value:

| `event` | Rule tab | Triggered When | Common Use Cases |
|---|---|---|---|
| `ticket_created` | Ticket Creation | A new ticket matches the rule's conditions | Create a CRM record, notify Slack, open an issue in a tracker |
| `ticket_updated` | Ticket Updates | A ticket update matches the rule's conditions | Sync status to a product tool, send an SMS on a customer reply, alert on a bad CSAT rating |

These two strings are used in `SKILL.md`, in all three example handlers and in
`setup.md`. If you add more rules, give each its own `event` value and add a
case to the dispatcher.

`{{Triggered event}}` is a Freshdesk placeholder that is "available only in
webhooks and returns the name of the event that triggered the rule". Freshdesk
doesn't publish its possible values, so the examples log it as
`triggered_event` but don't dispatch on it.

## Event Payload Structure

This is the recommended Advanced JSON body. Use the same shape for both rules
and change only `event`:

```json
{
  "event": "ticket_updated",
  "triggered_event": "{{Triggered event}}",
  "ticket": {
    "id": "{{ticket.id}}",
    "subject": "{{ticket.subject}}",
    "status": "{{ticket.status}}",
    "priority": "{{ticket.priority}}",
    "requester_email": "{{ticket.requester.email}}",
    "url": "{{ticket.url}}"
  }
}
```

Example delivery as received:

```http
POST /webhooks/freshdesk HTTP/1.1
Content-Type: application/json
X-Freshdesk-Webhook-Secret: 3f9c0e7b...

{"event":"ticket_updated","triggered_event":"...","ticket":{"id":"1042","subject":"Refund request","status":"Open","priority":"High","requester_email":"amy@example.com","url":"https://acme.freshdesk.com/helpdesk/tickets/1042"}}
```

Notes:

- **Every value can arrive as a string.** Quote each placeholder in your
  template so the JSON stays valid even when a value is empty, then convert
  types in your handler.
- **Freshdesk doesn't document escaping.** Free-text placeholders (descriptions,
  comments) might contain quotes or newlines. Prefer IDs and short fields, and
  fetch the rest from the API (`GET https://<domain>.freshdesk.com/api/v2/tickets/{id}`).
- **Simple Content** sends ticket properties in a format Freshdesk doesn't
  document, with no `event` field. Use Advanced.
- With **XML** encoding the examples return `400`, because they parse JSON
  only.

## Delivery Behaviour

From Freshdesk's "Webhook Callback Request Limits":

- **200–299:** success.
- **300–399:** "the callback will be redirected."
- **Anything else:** failure. It "will automatically be retried once every 30
  minutes, totaling 48 calls". Account admins get a failure email.
- **Rate limit:** 1000 calls per hour. "Calls requested after the rate limit
  will be buffered until fresh calls are available after 1 hour."
- Webhooks run asynchronously to the automation. If you make a GET call, your
  automation rules can't use the response.

There's no delivery-ID header, so build a dedupe key from the body.

## Full Event Reference

- [Using webhooks in automation rules](https://support.freshdesk.com/support/solutions/articles/132589-using-webhooks-in-automation-rules)
- [Automation examples: using webhooks](https://support.freshdesk.com/support/solutions/articles/50000009511-automation-examples-using-webhooks)
- [Freshdesk API reference](https://developers.freshdesk.com/api/) (for re-fetching tickets)
