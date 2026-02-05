# Postmark Webhooks Overview

## What Are Postmark Webhooks?

Postmark webhooks are HTTP callbacks that notify your application in real-time when email events occur. Unlike polling the API, webhooks push event data to your endpoint immediately when something happens with your emails.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Bounce` | Email permanently fails delivery | Update contact lists, handle invalid addresses |
| `SpamComplaint` | Recipient marks email as spam | Remove from mailing lists, protect sender reputation |
| `Open` | Email is opened by recipient | Track engagement rates, measure campaign effectiveness |
| `Click` | Link in email is clicked | Monitor CTR, track user behavior |
| `Delivery` | Email successfully delivered | Confirm delivery, update status |
| `SubscriptionChange` | User unsubscribes/resubscribes | Manage subscription preferences |
| `Inbound` | Incoming email received | Process replies, parse email content, automate responses |
| `SMTP API Error` | SMTP API call fails | Handle API errors, retry failed operations |

## Event Payload Structure

Postmark sends one event per webhook request (not batched). All events include:

```json
{
  "RecordType": "Bounce",
  "MessageID": "883953f4-6105-42a2-a16a-77a8eac79483",
  "MessageStream": "outbound",
  "ServerID": 23,
  "From": "sender@example.com",
  "Tag": "welcome-email",
  "Metadata": {
    "user_id": "12345",
    "campaign": "onboarding"
  }
}
```

### Bounce Event Fields

- `Email` - The bounced email address
- `Type` - Classification: HardBounce, Transient, etc.
- `TypeCode` - Numeric bounce type code
- `Description` - Human-readable bounce reason
- `BouncedAt` - ISO 8601 timestamp
- `DumpAvailable` - Whether full bounce content is available
- `Inactive` - Whether email is now deactivated
- `CanActivate` - Whether email can be reactivated

### Open Event Fields

- `Email` - Recipient email address
- `ReceivedAt` - When the email was opened
- `Platform` - Email client platform
- `UserAgent` - Browser/client user agent
- `OS` - Operating system details

### Click Event Fields

- `Email` - Recipient email address
- `ClickedAt` - When the link was clicked
- `OriginalLink` - The actual link URL
- `Platform` - Email client platform
- `UserAgent` - Browser user agent
- `ClickLocation` - HTML or Text

### Inbound Event Fields

- `Email` - Sender email address
- `FromFull` - Full sender info (name and email)
- `ToFull` - Full recipient info array
- `Subject` - Email subject line
- `TextBody` - Plain text body content
- `HtmlBody` - HTML body content
- `StrippedTextReply` - Reply text with quotes removed
- `Attachments` - Array of attachment metadata
- `MessageStream` - Always "inbound"

### SMTP API Error Event Fields

- `Error` - Error message from the API
- `ErrorCode` - Numeric error code
- `MessageID` - ID of the failed message
- `Email` - Recipient email address
- `From` - Sender email address
- `Subject` - Email subject that failed
- `ServerID` - Postmark server ID

## Authentication Methods

Postmark does NOT use signature verification. Instead, authentication options include:

1. **Basic Authentication in URL**
   ```
   https://username:password@yourdomain.com/webhooks/postmark
   ```

2. **Token Parameter**
   ```
   https://yourdomain.com/webhooks/postmark?token=your-secret-token
   ```

3. **IP Allowlisting**
   - Firewall configuration to only accept requests from Postmark IPs

## Testing Webhooks

Postmark provides several testing methods:

1. **Test Button** - Send sample webhook from dashboard
2. **RequestBin** - Capture and inspect webhook payloads
3. **Hookdeck CLI** - Local tunnel for development

## Full Event Reference

For the complete list of events and fields, see [Postmark's webhook documentation](https://postmarkapp.com/developer/webhooks/webhooks-overview).