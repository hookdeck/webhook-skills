# SendGrid Inbound Parse Webhooks Overview

## What Is SendGrid Inbound Parse?

Twilio SendGrid **Inbound Parse** turns an email address into a webhook. You
point an MX record at `mx.sendgrid.net` for a hostname you control (e.g.
`parse.example.com`), register a Parse Setting for that hostname, and SendGrid
POSTs every email delivered to `anything@parse.example.com` to your URL.

Each POST is **one inbound email**, encoded as `multipart/form-data`.

## There Are No Event Types

This is the single most common mistake when porting code from the SendGrid
**Event Webhook**. Inbound Parse has **no** `event` or `type` field and no
documented event-name vocabulary. The only thing that ever happens is *an email
arrived*.

Route on the **recipient** instead:

```javascript
const envelope = JSON.parse(fields.envelope);   // {"to":["support@parse.example.com"],"from":"…"}
const recipient = envelope.to[0];               // envelope.to is a single-element array
switch (recipient.split('@')[0]) {
  case 'support': return handleSupport(fields);
  case 'billing': return handleBilling(fields);
  default:        return handleCatchAll(fields);
}
```

`envelope.to` is the SMTP RCPT TO — the address SendGrid actually delivered to.
The `to` form field comes from the message **headers** and can differ (BCC,
aliases, forwarding). Prefer `envelope.to` for routing; use the `to` header
field for display.

## Two Payload Formats

The Parse Setting's `send_raw` flag decides the body shape. Handlers should
tolerate both — the flag can be flipped in the SendGrid UI or over the API
without touching your code.

### Default data format (`send_raw: false`)

| Field | Description | Notes |
|-------|-------------|-------|
| `headers` | The raw headers of the email | Plain text blob |
| `dkim` | Verification results of any DKIM and domain keys signatures | Bare string, e.g. `{@sendgrid.com : pass}` — **looks like JSON, is not valid JSON** |
| `content-ids` | Identifiers of the attachments included in the message | **JSON string**, e.g. `{"ii_1562e2169c132d83":"attachment1"}` |
| `to` | Recipient email address extracted from the message headers | May be a JSON object or a plain address string — parse defensively |
| `text` | The text-formatted form of the email body | |
| `html` | The HTML-formatted form of the email body, if provided | Absent for plain-text-only mail |
| `from` | Email sender extracted from the message headers | e.g. `Sender Name <sender@example.com>` |
| `sender_ip` | IP address the message was sent from | **Data, not authentication** — see below |
| `spam_report` | The SpamAssassin report text | Only when `spam_check: true` |
| `envelope` | JSON object representing the SMTP envelope | **JSON string**: `{"to":["x@y.com"],"from":"a@b.com"}` |
| `attachments` | The **number** of attachments | A string like `"2"` — a count, not a list |
| `subject` | The subject line | |
| `spam_score` | SpamAssassin rating | Only when `spam_check: true`; string, e.g. `"0.011"` |
| `attachment-info` | JSON object with one entry per attachment | **JSON string**, hyphenated key |
| `charsets` | Character sets of the extracted values | **JSON string**: `{"to":"UTF-8","from":"UTF-8","subject":"UTF-8","text":"UTF-8","html":"UTF-8"}` |
| `SPF` | Sender Policy Framework verification result | **Upper-case** field name, e.g. `pass` |

Plus one multipart **file part** per attachment, named `attachment1`,
`attachment2`, … each with its own `Content-Type` and `filename`.

`attachment-info` maps those part names to metadata:

```json
{
  "attachment1": {"filename":"image.png","name":"image.png","type":"image/png","content-id":"ii_1562e2169c132d83"},
  "attachment2": {"filename":"document.pdf","name":"document.pdf","type":"application/pdf"}
}
```

`content-id` is only present for inline attachments (those referenced by
`cid:` in the HTML body). `content-ids` is the reverse index: CID → part name.

The documented example numbers parts from `attachment1`; the docs' prose says
`X` "ranges from `0` to the total number of attachments". Don't hardcode a
starting index — iterate the keys of `attachment-info`, or walk the form parts.

### Raw data format (`send_raw: true`)

| Field | Description |
|-------|-------------|
| `dkim` | Verification results of any DKIM and domain keys signatures |
| `email` | **The entire raw MIME message** — headers, date, body and base64-encoded attachments as one string |
| `to` | Recipient extracted from the message headers |
| `from` | Sender extracted from the message headers |
| `sender_ip` | IP address the message was sent from |
| `spam_report` | SpamAssassin report (only when `spam_check: true`) |
| `envelope` | JSON string representing the SMTP envelope |
| `subject` | The subject line |
| `spam_score` | SpamAssassin rating (only when `spam_check: true`) |
| `charsets` | JSON string of character sets |
| `SPF` | SPF verification result |

There is **no** `headers`, `html`, `text`, `attachments`, `content-ids` or
`attachment-info` field in raw mode, and no separate `attachmentX` file parts —
attachments live inside `email`. Use a MIME parser
(`mailparser` in Node, `email.parser` in Python) to decompose it.

Detect the mode at runtime rather than from config:

```javascript
const isRaw = fields.email !== undefined;
```

## Field-Name Traps

- `SPF` is upper-case. `spf` will be `undefined`.
- `content-ids` and `attachment-info` are hyphenated — `fields['attachment-info']`,
  never `fields.attachmentInfo` or `fields.attachment_info`.
- `envelope`, `charsets`, `content-ids`, `attachment-info` (and often `to`) are
  **JSON strings**. Wrap every `JSON.parse` in a try/catch; malformed mail is a
  fact of life on an inbound address.
- `dkim` is **not** JSON. `JSON.parse('{@sendgrid.com : pass}')` throws.
- `attachments` is a count string. `fields.attachments.length` gives you the
  number of digits, not the number of files.

## `sender_ip` Is Not Authentication

`sender_ip` is the IP of the **email sender** — an attacker-influenced value
carried in the message, not the IP of SendGrid's POST. Never use it as an
allowlist or a trust signal. There is no documented source-IP allowlist for
Inbound Parse POSTs; use the signature or OAuth security policy instead
(see [verification.md](verification.md)).

Similarly, `SPF` and `dkim` describe the *email's* authentication, not the
*webhook's*. They tell you whether to trust the sender of the mail; they say
nothing about whether the HTTP request came from SendGrid.

## Size Limits

SendGrid advises keeping the total message — body plus attachments — under
**30 MB**. Spam checking only analyses messages up to 2.5 MB; larger messages
are flagged as non-spam by default. Individual ISPs may impose stricter limits
or block attachments entirely.

Size your raw-body buffer accordingly: an Express `express.raw()` limit of the
default `100kb` silently rejects almost every real email with an attachment.

## Full Reference

- [Setting up the Inbound Parse Webhook](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/setting-up-the-inbound-parse-webhook)
- [Securing your Parse Webhooks](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/securing-your-parse-webhooks)
- [Inbound email](https://www.twilio.com/docs/sendgrid/for-developers/parsing-email/inbound-email)
