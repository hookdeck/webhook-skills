# SendGrid Webhooks Overview

## What Are SendGrid Webhooks?

SendGrid webhooks (Event Webhook) provide real-time notifications about email delivery status and recipient engagement. Each time an email event occurs, SendGrid sends a POST request to your configured endpoint with event details.

## Common Event Types

### Delivery Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `processed` | Email accepted and queued for delivery | Track processing status |
| `delivered` | Successfully delivered to recipient server | Confirm delivery |
| `bounce` | Permanent delivery failure | Update invalid emails |
| `deferred` | Temporary delivery failure | Monitor delivery delays |
| `dropped` | Email not sent (prior bounce, unsubscribe, etc.) | Analyze drop reasons |
| `blocked` | Message blocked by recipient server | Review content/reputation |

### Engagement Events

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `open` | Recipient opens HTML email | Track engagement rates |
| `click` | Recipient clicks a tracked link | Analyze CTR, popular links |
| `spam report` | Email marked as spam | Maintain sender reputation |
| `unsubscribe` | Recipient unsubscribes | Update subscription lists |
| `group unsubscribe` | Unsubscribe from specific group | Manage group preferences |
| `group resubscribe` | Resubscribe to specific group | Track re-engagement |

## Event Payload Structure

SendGrid sends events as a JSON array, even for single events:

```json
[
  {
    "email": "user@example.com",
    "timestamp": 1669651200,
    "event": "delivered",
    "sg_event_id": "WTJmMTYyNDUtMzQ2MC00YzY4LWI1ZDQtZGU4MDFhMmI4NmYz",
    "sg_message_id": "14c5d75ce93.dfd.64b469.filter0001.16648.5515E0B88.0",
    "smtp-id": "<14c5d75ce93.dfd.64b469@ismtpd0001p1>",
    "category": ["newsletter", "weekly"],
    "marketing_campaign_id": 12345,
    "marketing_campaign_name": "Weekly Newsletter"
  }
]
```

### Common Fields

- `email` - Recipient email address
- `timestamp` - Unix timestamp of the event
- `event` - Event type (delivered, bounce, open, etc.)
- `sg_event_id` - Unique identifier for this event
- `sg_message_id` - SendGrid message ID for correlation
- `category` - Custom categories assigned to the email
- `url` - (Click events) The URL that was clicked
- `reason` - (Bounce/dropped events) Reason for failure

## Configuration Requirements

1. **Enable Event Webhook** in SendGrid settings
2. **Configure endpoint URL** where events will be sent
3. **Enable specific events** you want to receive
4. **Enable security features** (Signed Event Webhook)
5. **Set up open/click tracking** if needed for engagement events

## Best Practices

- Process webhooks asynchronously to return 200 quickly
- Implement idempotency using `sg_event_id`
- Handle array payloads (even single events come as arrays)
- Store raw events for debugging and replay
- Monitor webhook processing for failures

## Full Event Reference

For the complete list of events and fields, see [SendGrid's Event Webhook documentation](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event).