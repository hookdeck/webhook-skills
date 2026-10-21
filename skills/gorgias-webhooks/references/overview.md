# Gorgias Webhooks Overview

## What Are Gorgias Webhooks?

Gorgias calls them **HTTP integrations**. An HTTP integration is an outbound
HTTP request that Gorgias makes when a ticket event fires. You configure:

- the **URL** (can contain template variables, e.g. `?email={{ticket.customer.email}}`)
- the **HTTP method**: `GET`, `POST`, `PUT` or `DELETE` in the UI; the
  Integration API also accepts `HEAD` and `PATCH`
- the **request content type** (when the method isn't `GET`):
  `application/json` or `application/x-www-form-urlencoded`
- the **request body**, a template you write
- **headers** or **OAuth2** for authentication
- the **triggers** that fire it

The same feature is used to *fetch* data into the ticket sidebar (a `GET`
whose JSON response becomes a widget). This skill covers the other use:
**sending ticket events to your endpoint**.

Source: [Connect external apps to Gorgias](https://docs.gorgias.com/en-US/http-integrations-81822)
and the [Create an integration](https://developers.gorgias.com/reference/create-integration) API reference.

## What Triggers Are Available?

The Integration API's `http.triggers` object takes these keys (all default to
`false`):

| Trigger key | UI label | Fires when |
|---|---|---|
| `ticket-created` | Ticket created | A ticket is created |
| `ticket-updated` | Ticket updated | A ticket is updated. Adding a tag counts. |
| `ticket-message-created` | Ticket message created | A new message is created in a ticket |
| `ticket-self-unsnoozed` | Ticket self unsnoozed | The snooze delay ends |
| `ticket-message-failed` | Ticket message failed | A message fails to send |
| `ticket-assignment-updated` | Ticket assignment updated | The ticket assignee changes |
| `ticket-status-updated` | Ticket status updated | The ticket status changes |
| `ticket-handed-over` | — | A ticket is handed over to another user ("further configuration is required") |

`ticket-assignment-updated` and `ticket-status-updated` are **mutually
exclusive with the others**: selecting either disables the rest.

The API reference's example also shows underscore keys (`ticket_created`);
the schema properties and the response in Gorgias's own tutorial use the
hyphenated form above.

## Event Payload Structure

**There is no fixed payload.** Gorgias renders the body template you wrote
and sends that. It adds no event name, no delivery ID and no timestamp.
Because a single integration can listen to several triggers, your endpoint
can't tell which trigger fired unless you encode it yourself.

The convention this skill uses: **one integration per trigger**, each with
the trigger key hard-coded in an `event` field. For example:

```json
{
  "event": "ticket-message-created",
  "ticket_id": "{{ticket.id}}",
  "subject": "{{ticket.subject}}",
  "status": "{{ticket.status}}",
  "channel": "{{ticket.channel}}",
  "customer_email": "{{ticket.customer.email}}",
  "assignee_email": "{{ticket.assignee_user.email}}",
  "updated_datetime": "{{ticket.updated_datetime}}",
  "message_text": "{{ticket.messages[-1].body_text}}"
}
```

What arrives:

```json
{
  "event": "ticket-message-created",
  "ticket_id": "48213",
  "subject": "Where is my order?",
  "status": "open",
  "channel": "email",
  "customer_email": "jane@example.com",
  "assignee_email": "",
  "updated_datetime": "2026-10-21T09:14:02.118000+00:00",
  "message_text": "Hi, my order #1042 hasn't arrived yet."
}
```

Keep the keys flat. The examples also accept the same keys as
`application/x-www-form-urlencoded` (key-value form data, which can't nest).
Variables inside quoted JSON strings arrive as strings, so `ticket_id` is
`"48213"`, not a number.

Alternatively, put the event in the URL (`https://example.com/webhooks/gorgias?event=ticket-created`).
The examples read `event` from the body first, then from the query string.

## Which Template Variables Can I Use?

Any property of the ticket context
([TicketHttpIntegration object](https://developers.gorgias.com/reference/the-tickethttpintegration-object)),
for example `id`, `external_id`, `status`, `channel`, `via`, `spam`,
`subject`, `language`, `customer_id`, `assignee_user_id`, `assignee_team_id`,
`created_datetime`, `updated_datetime`, `closed_datetime`,
`snooze_datetime`, `tags` and `custom_fields`, plus the macro variables in
[Macro variables 101](https://docs.gorgias.com/en-US/macro-variables-101-81845):

| Variable | Value |
|---|---|
| `{{ticket.id}}` | Ticket ID |
| `{{ticket.subject}}` | Subject |
| `{{ticket.channel}}` | Channel (`email`, `chat`, …) |
| `{{ticket.created_datetime}}` / `{{ticket.updated_datetime}}` | Timestamps |
| `{{ticket.customer.id}}` / `{{ticket.customer.email}}` / `{{ticket.customer.firstname}}` | Customer |
| `{{ticket.assignee_user.id}}` / `{{ticket.assignee_user.email}}` / `{{ticket.assignee_user.name}}` | Assigned agent |
| `{{ticket.messages[0].body_text}}` | First message (plain text) |
| `{{ticket.messages[-1].body_html}}` | Latest message (HTML) |

## Delivery Behavior

From the "Reliability and event delivery" section of the Gorgias docs:

| Situation | Header auth | OAuth2 |
|---|---|---|
| Endpoint unreachable (down, connection refused) | Retried | Retried |
| Connected but no response within **5 seconds** | **Not retried** | Retried |
| Error status code (e.g. 429, 500) | Not retried | Not retried |

Retries: up to 3 attempts with exponential backoff (10s, 20s, then 40s).

Gorgias **disables the integration after 500 consecutive failed requests**.
A success resets the counter. Each integration's **Events** tab shows the
latest requests and their results.

Because error responses aren't retried, a 500 from your handler loses the
event. Acknowledge with `200` quickly and do the work asynchronously, or put
a queue such as the Hookdeck Event Gateway in front of your endpoint (Gorgias's
docs suggest this).

## Full Reference

- [HTTP integrations (help center)](https://docs.gorgias.com/en-US/http-integrations-81822)
- [Integration object](https://developers.gorgias.com/reference/the-integration-object)
- [Create integrations and widgets (tutorial)](https://developers.gorgias.com/docs/create-integrations-and-widgets-programmatically)
