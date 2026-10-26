# Logto Webhooks Overview

## What Are Logto Webhooks?

Logto sends an asynchronous HTTP `POST` to each endpoint subscribed to an event. Delivery happens outside the authentication request, so a webhook response can't allow, block or change the current sign-in. For logic that must finish before sign-in continues, Logto points to Actions instead.

Delivery notes from the docs:

- Respond with `200` right after receiving the request. Slow processing can make the webhook time out, and Logto asks you not to return anything other than 200; handle processing errors on your own server.
- Best practice is to put the event on your own queue and return quickly.
- The retry schedule, timeout length and exact success codes are not documented on the pages these skills were built from, so make handlers idempotent.
- Default request headers: `user-agent: Logto (https://logto.io/)`, `content-type: application/json` (both customizable), and `logto-signature-sha-256`.

## Common Event Types

The event name is the top-level `event` field. The examples handle the events marked with a check and log everything else.

| Event | Handled | Triggered When |
|-------|---------|----------------|
| `PostRegister` | yes | A user completes sign-up through the Experience API |
| `PostSignIn` | yes | A user signs in |
| `PostResetPassword` | yes | A password is reset through "Forgot password" |
| `User.Created` | yes | A user is created (Management API or registration) |
| `User.Data.Updated` | yes | User profile data changes (email, avatar, custom data, social identity, password) |
| `User.Deleted` | yes | A user is deleted |
| `User.SuspensionStatus.Updated` | yes | A user is suspended or reactivated |
| `Grant.LimitExceeded` | yes | An application exceeded its grant limit |
| `Role.Created`, `Role.Deleted`, `Role.Data.Updated`, `Role.Scopes.Updated` | log | Role changes |
| `Scope.Created`, `Scope.Deleted`, `Scope.Data.Updated` | log | API permission changes |
| `Organization.Created`, `Organization.Deleted`, `Organization.Data.Updated`, `Organization.Membership.Updated` | log | Organization changes; membership events carry `organizationId` and optional `addedUserIds`, `removedUserIds`, `addedApplicationIds`, `removedApplicationIds` |
| `OrganizationRole.Created`, `OrganizationRole.Deleted`, `OrganizationRole.Data.Updated`, `OrganizationRole.Scopes.Updated` | log | Organization role changes |
| `OrganizationScope.Created`, `OrganizationScope.Deleted`, `OrganizationScope.Data.Updated` | log | Organization permission changes |
| `TrustedDevice.Created`, `TrustedDevice.Deleted` | log | Trusted-device records |
| `Identifier.Lockout`, `Message.RateLimited` | log | Security exceptions |

## Event Payload Structure

Fields present in every delivery:

| Field | Type | Notes |
|-------|------|-------|
| `hookId` | string | The webhook configuration ID |
| `event` | string | The event name |
| `createdAt` | string | ISO 8601 time |
| `userAgent` | string, optional | User agent of the triggering request |

Families add their own fields:

- **User flow** (`PostRegister`, `PostSignIn`, `PostResetPassword`): `interactionEvent` (`SignIn`, `Register` or `ForgotPassword`), optional `sessionId`, `userIp`, `userId`, `user`, `applicationId`, `application`.
- **Data mutation** (`User.*`, `Role.*`, `Organization.*`, ...): `ip`, a top-level `data` with the affected entity (or `null` for deletes and membership changes), plus either Experience API context (`interactionEvent`, `sessionId`, `applicationId`, `application`) or Management API context (`path`, `method`, `status`, `params`, `matchedRoute`).
- **Exception** (`Identifier.Lockout`, `Message.RateLimited`, `Grant.LimitExceeded`): `ip` plus event-specific fields.

`interactionEvent` also appears on data-mutation bodies caused by a user flow, so never use it to decide which event arrived. Use `event`.

Example (`Grant.LimitExceeded`, from the docs):

```json
{
  "hookId": "hook_abc",
  "event": "Grant.LimitExceeded",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "ip": "192.168.0.1",
  "userAgent": "Mozilla/5.0",
  "userId": "u_001",
  "applicationId": "app_xyz",
  "application": { "id": "app_xyz", "type": "SPA", "name": "My app", "description": "My app description" },
  "maxAllowedGrants": 2,
  "preRevocationActiveGrantCount": 3,
  "revokedGrantIds": ["grant_001"]
}
```

## Full Event Reference

- [Webhook events](https://docs.logto.io/developers/webhooks/webhooks-events)
- [Webhook request format](https://docs.logto.io/developers/webhooks/webhooks-request)
- [Webhooks overview](https://docs.logto.io/developers/webhooks)
