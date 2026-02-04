# FusionAuth Webhooks Overview

## What Are FusionAuth Webhooks?

FusionAuth uses webhooks to notify your application when authentication and user management events occur. Instead of polling the API for changes, FusionAuth sends HTTP POST requests with JSON payloads to your configured endpoint URL whenever something happens—like a user signing up, logging in, or updating their profile.

Webhooks are essential for:
- Syncing user data to external systems
- Triggering workflows when users register or log in
- Auditing authentication events
- Implementing custom security responses to failed logins

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.create` | New user account created | Sync to CRM, send welcome email |
| `user.update` | User profile updated | Update external systems |
| `user.delete` | User account deleted | Clean up external data, GDPR compliance |
| `user.deactivate` | User account deactivated | Revoke access, notify admins |
| `user.reactivate` | User account reactivated | Restore access |
| `user.login.success` | User successfully authenticated | Audit logging, session tracking |
| `user.login.failed` | Login attempt failed | Security monitoring, rate limiting |
| `user.registration.create` | User registered for an application | Provision app-specific access |
| `user.registration.update` | User registration updated | Sync role changes |
| `user.registration.delete` | User registration removed | Revoke app access |
| `user.email.verified` | User verified email address | Enable features requiring verified email |
| `user.password.breach` | Password found in breach database | Force password reset (licensed feature) |
| `jwt.refresh` | Access token refreshed | Session extension tracking |
| `jwt.refresh-token.revoke` | Refresh token(s) revoked | Force re-authentication |
| `group.create` | Group created | Sync group to external IAM |
| `group.update` | Group updated | Update external group settings |
| `group.delete` | Group deleted | Clean up external group |
| `group.member.add` | User added to group | Grant group-based permissions |
| `group.member.remove` | User removed from group | Revoke group-based permissions |
| `audit-log.create` | Audit log entry created | External audit system sync |

## Event Payload Structure

All FusionAuth webhook events share a common structure:

```json
{
  "event": {
    "applicationId": "10000000-0000-0002-0000-000000000001",
    "createInstant": 1505762615056,
    "id": "e502168a-b469-45d9-a079-fd45f83e0406",
    "info": {
      "ipAddress": "192.168.1.100",
      "userAgent": "Mozilla/5.0..."
    },
    "tenantId": "10000000-0000-0001-0000-000000000000",
    "type": "user.login.success",
    "user": {
      "id": "00000000-0000-0001-0000-000000000001",
      "email": "user@example.com",
      "username": "user123",
      "firstName": "John",
      "lastName": "Doe",
      "verified": true,
      "active": true
    }
  }
}
```

Key fields:
- `event.type` - The event type (e.g., `user.login.success`)
- `event.id` - Unique event ID (use for idempotency)
- `event.createInstant` - Timestamp when event occurred (milliseconds since epoch)
- `event.tenantId` - The tenant this event belongs to
- `event.applicationId` - Application context (when applicable)
- `event.user` - Full user object (for user events)

## Transaction Settings

FusionAuth supports configurable transaction levels for webhooks:

| Setting | Behavior |
|---------|----------|
| **No Webhooks required** | Event succeeds regardless of webhook response |
| **Any single Webhook must succeed** | At least one webhook must return 2xx |
| **Simple majority must succeed** | 50%+ of webhooks must return 2xx |
| **Two-thirds majority must succeed** | 66.7%+ of webhooks must return 2xx |
| **All Webhooks must succeed** | Every webhook must return 2xx |

When required webhooks fail, FusionAuth returns HTTP 504 with error details.

## System vs Tenant Events

Most events are scoped to a tenant, but some are system-level:

**System Events (not tenant-scoped):**
- `audit-log.create`
- `event-log.create`
- `kickstart.success`

**Tenant Events (can be filtered by tenant):**
- All user events
- All group events
- All JWT events

## Full Event Reference

For the complete list of events and payload schemas, see [FusionAuth Webhook Events Documentation](https://fusionauth.io/docs/extend/events-and-webhooks/events/).
