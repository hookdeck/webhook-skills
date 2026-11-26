# Clerk Webhooks Overview

## What Are Clerk Webhooks?

Clerk uses webhooks to notify your application when important events occur in your user authentication system. These events are sent as HTTP POST requests to your specified endpoints, allowing you to react to changes in real-time.

Clerk uses Svix to handle webhook delivery, which provides enterprise-grade reliability with automatic retries, signature verification, and comprehensive logging.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.created` | New user signs up | Create user profile, send welcome email, provision resources |
| `user.updated` | User profile changes | Sync user data, update permissions, audit changes |
| `user.deleted` | User account removed | Clean up user data, cancel subscriptions, archive records |
| `session.created` | User signs in | Log activity, update last login, check concurrent sessions |
| `session.ended` | User signs out | Log activity, clean up temporary data |
| `session.removed` | User signs out and the session is removed from the client | Log activity, clean up session data |
| `organization.created` | New org created | Set up team workspace, assign default roles |
| `organization.updated` | Org settings change | Update billing, sync permissions |
| `organizationMembership.created` | User joins org | Grant access, send notification |
| `organizationInvitation.created` | Invite sent | Track pending invites, send reminders |

## Event Payload Structure

All Clerk webhook events follow this structure:

```json
{
  "data": {
    // Event-specific data (user object, session details, etc.)
  },
  "object": "event",
  "type": "user.created",  // Event type
  "instance_id": "your-clerk-instance-id",
  "timestamp": 1234567890000  // Milliseconds since epoch
}
```

### Example: user.created Event

```json
{
  "data": {
    "id": "user_2NNEqL2nrIRxCBNiiSPAKxvlkEJ",
    "object": "user",
    "username": "example_user",
    "first_name": "John",
    "last_name": "Doe",
    "email_addresses": [{
      "id": "idn_29w83sxSDx2n0a9Yg0JNH0nDJK9",
      "object": "email_address",
      "email_address": "user@example.com",
      "verification": {
        "status": "verified",
        "strategy": "email_code"
      }
    }],
    "primary_email_address_id": "idn_29w83sxSDx2n0a9Yg0JNH0nDJK9",
    "created_at": 1654012345678,
    "updated_at": 1654012345678
  },
  "object": "event",
  "type": "user.created",
  "instance_id": "ins_2NNEqL2n",
  "timestamp": 1654012345678
}
```

## Webhook Headers

Clerk webhooks include these Svix headers for verification:

- `svix-id` - Unique message identifier
- `svix-timestamp` - Unix timestamp (seconds)
- `svix-signature` - HMAC-SHA256 signature(s)

## Delivery Guarantees

- **At-least-once delivery** - Events may be delivered multiple times
- **Retry schedule** - Failed deliveries are retried on [Svix's schedule](https://docs.svix.com/retries), with exponential backoff
- **Same `svix-id` on every attempt** - Store it to skip events you've already processed
- **Order not guaranteed** - Events may arrive out of order
- **Idempotency required** - Your handler should handle duplicate events gracefully

## Full Event Reference

For the complete list of events, see the **Event Catalog** tab on the [Webhooks page](https://dashboard.clerk.com/~/webhooks) in the Clerk Dashboard. Clerk's [webhooks OpenAPI spec](https://github.com/clerk/openapi-specs/blob/main/webhooks/2025-04-15.yml) has an example payload for each event it lists.