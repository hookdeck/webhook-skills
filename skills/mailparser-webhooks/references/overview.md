# Mailparser Webhooks Overview

## What Are Mailparser Webhooks?

Mailparser parses incoming emails (and attachments) into structured fields.
**Advanced Webhooks** ("your Swiss Army knife for connecting any HTTP API to
Mailparser") send those parsed fields to a target URL automatically once an
email has been parsed. Source: [How do advanced webhooks work](https://help.mailparser.io/hc/en-us/articles/16253409612564-How-do-advanced-webhooks-work).

## Are There Event Types?

No. The documentation defines no event names and the payload has no
`event` or `type` field. There is a single trigger: **an email was parsed**
(`parsed email` in this skill's test scenario). Anything that distinguishes
messages is a field you add to your own template.

## Advanced Webhook Options

| Option | Notes |
|---|---|
| Name | Label for telling webhooks apart |
| What data to send | Default: all parsed data of one email in one request. "One request per row": one HTTP request per parsed table row (invoice line items, price lists) |
| HTTP Verb | `POST` default; `GET`, `PUT`, `DELETE` possible |
| Target URL | Supports the same replacement patterns as the body |
| Content-Type | "Form Data" or JSON; sets the default body template |
| Webhook Delay | Delay between calls to avoid overwhelming the receiver |
| Additional Headers | Extra HTTP headers, one per line (`Name: value`) |
| HTTP Body Payload Template | Fully custom body, Handlebars-based (`{{MyParsingRule}}`, loops over table rows) |

Changing the Content-Type or "What data to send" resets the template to the
matching default.

## Payload Structure

Whatever your template renders. Example JSON template and body:

```
{ "invoice_number": "{{InvoiceNumber}}", "total": "{{Total}}", "from": "{{from_email}}" }
```

```json
{ "invoice_number": "INV-1042", "total": "129.00", "from": "billing@example.com" }
```

Field names depend on your parsing rules; verify with **Preview Payload** in
Mailparser, which renders the template with your last parsed document.
Rendered values may arrive as strings, so validate and coerce them.

## Idempotency

There is no event ID or timestamp header. Either put a unique parsed value in
the template (an invoice number, order ID, or the email's own message
identifier) and key on it, or hash the raw body. The examples log a SHA-256 of
the raw body as a fallback key.

## Full Reference

See [How do advanced webhooks work](https://help.mailparser.io/hc/en-us/articles/16253409612564-How-do-advanced-webhooks-work).
