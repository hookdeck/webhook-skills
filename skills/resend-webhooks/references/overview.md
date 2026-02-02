# Resend Webhooks Overview

## What Are Resend Webhooks?

Resend uses webhooks to notify your application when email events occur. Instead of polling the API for delivery status, Resend sends HTTP POST requests to your configured endpoint URL whenever something happens—like an email being delivered, bounced, or opened.

Resend uses [Svix](https://www.svix.com/) as its webhook delivery infrastructure, which means webhook signatures use the Svix format (svix-id, svix-timestamp, svix-signature headers).

## Webhook Types

Resend supports two categories of webhooks:

### Outbound Email Events

Track the lifecycle of emails you send through Resend:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.sent` | Email accepted by Resend | Update send status, start delivery tracking |
| `email.delivered` | Email delivered to recipient's mail server | Confirm delivery, update records |
| `email.delivery_delayed` | Delivery is temporarily delayed | Monitor delivery health |
| `email.bounced` | Email bounced (permanent or temporary) | Remove invalid addresses, notify sender |
| `email.complained` | Recipient marked as spam | Unsubscribe user, prevent future sends |
| `email.opened` | Recipient opened the email | Track engagement metrics |
| `email.clicked` | Recipient clicked a link | Track engagement, attribution |

### Inbound Email Events

Receive and process emails sent to your domain:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `email.received` | Email arrives at your receiving domain | Support tickets, email parsing, forwarding |

**Important:** The `email.received` webhook contains metadata only (sender, recipient, subject, attachment info). To get the email body and attachment content, you must call the Resend API separately.

## Event Payload Structure

All Resend webhook events share a common structure:

```json
{
  "type": "email.delivered",
  "created_at": "2024-02-22T23:41:12.126Z",
  "data": {
    "email_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "from": "sender@example.com",
    "to": ["recipient@example.com"],
    "subject": "Welcome to our service",
    "created_at": "2024-02-22T23:41:10.000Z"
  }
}
```

### Inbound Email Payload (`email.received`)

```json
{
  "type": "email.received",
  "created_at": "2024-02-22T23:41:12.126Z",
  "data": {
    "email_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "from": "customer@example.com",
    "to": ["support@yourdomain.com"],
    "cc": [],
    "bcc": [],
    "subject": "Question about my order",
    "attachments": [
      {
        "id": "att_abc123",
        "filename": "receipt.pdf",
        "content_type": "application/pdf"
      }
    ]
  }
}
```

**Note:** The `email.received` payload does not include the email body or attachment content. Use the Receiving API to fetch these:

```javascript
// Get email body
const { data: email } = await resend.emails.receiving.get(event.data.email_id);
console.log(email.html);  // HTML body
console.log(email.text);  // Plain text body

// Get attachments
const { data: attachments } = await resend.emails.receiving.attachments.list({
  emailId: event.data.email_id
});
```

## Key Fields

- `type` - The event type (e.g., `email.delivered`)
- `data.email_id` - Unique email ID (use for idempotency and API calls)
- `created_at` - When the event occurred
- `data.from` - Sender email address
- `data.to` - Recipient email address(es)

## Delivery Guarantees

- Webhooks are delivered at least once (may receive duplicates)
- Failed deliveries are retried with exponential backoff
- Use `email_id` for idempotent processing
- Resend stores events even if your webhook is temporarily down

## Full Documentation

For the complete event reference, see [Resend's webhook documentation](https://resend.com/docs/webhooks).
