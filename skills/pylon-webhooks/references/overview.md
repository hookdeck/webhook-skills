# Pylon Webhooks Overview

## What Are Pylon Webhooks?

[Pylon](https://usepylon.com) is a B2B customer support platform (issues, shared
inboxes, accounts, and a knowledge base). Its webhooks are user-defined HTTP
callbacks: you create a webhook (target URL, method, optional custom headers),
then fire it from a **workflow trigger** or a **macro** with a **Send webhook**
action. Each delivery is signed with HMAC-SHA256 so you can confirm it came from
Pylon. See the [Webhooks docs](https://docs.usepylon.com/pylon-docs/developer/webhooks).

> Pylon the solar design platform (getpylon.com) is a different company with a
> different signature scheme (`Pylon-Webhook-Signature: hs256=…`). This skill is
> for usepylon.com.

## No Event Types

Pylon doesn't send a fixed event catalog, and there is no event-type field or
header. A trigger's **conditions** control when the webhook fires (for example,
an issue is created or its status changes), and the **JSON payload** you write in
the Send webhook action controls what it carries.

If one endpoint receives several triggers, add your own discriminator to each
template, for example `"trigger": "issue_created"`.

## Payload Structure

You write the body as JSON with template variables. Pylon's docs show:

```json
{
  "issue_id": "{{ issue.id }}",
  "number": "{{ issue.number }}",
  "title": "{{ issue.title }}",
  "tags": "{{ issue.tags }}",
  "requester_email": "{{ issue.requester.email }}",
  "last_message_id": "{{ issue.last_message.id }}",
  "last_message_html": "{{ issue.last_message.body_html }}",
  "last_message_author": "{{ issue.last_message.author.name }}"
}
```

Rules from the docs:

- The template must be valid JSON before variables are filled in.
- Put every variable inside a JSON string: `"id": "{{issue.id}}"` works, and
  `"id": {{issue.id}}` does not. Pylon escapes each value but doesn't add quotes.
- Every value arrives as a string, including numbers, dates and `true`/`false`.
- Lists such as `{{ issue.tags }}` arrive as one comma-separated string, and
  missing values arrive as `""`.
- Variables can also go in the Target URL, where they are **not** URL-encoded.

The variables available depend on the trigger's object; see Pylon's Template
variables page for the full list.

The **Test** button sends `{"data":{"type":"ping"}}`.

## Delivery and Retries

- **Timeout:** each attempt waits up to 20 seconds.
- **Success:** any status below 400.
- **Retries:** up to 3 attempts in total. After a 4xx, 5xx, timeout or connection
  failure, Pylon retries after about 4 seconds, then about 8 seconds. Retries carry
  `X-Pylon-Retry-Number`.
- **At-least-once and unordered:** a delivery can arrive more than once or out of
  order.
- **No event ID header:** to de-duplicate, include an identifier such as
  `{{issue.id}}` with the field that changed in your template.
- Every request is sent with `Content-Type: application/json`.
- Private and internal network addresses are blocked as targets. If your endpoint
  is behind a firewall, allowlist Pylon's IP addresses for your region.

The **Logs** tab on the Webhooks page lists every attempt with its status, method,
payload, response, duration and request ID.
