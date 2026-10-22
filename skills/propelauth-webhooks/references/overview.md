# PropelAuth Webhooks Overview

## What Are PropelAuth Webhooks?

PropelAuth sends an HTTP request to your endpoint when something happens to your users or
organizations: a user signs up, joins an organization, has their role changed, and so on.
Typical uses are copying users and organizations into your own database, sending a welcome
email, provisioning resources at sign-up, or updating billing as people join organizations.

PropelAuth's docs state: "We use Svix for our Webhooks." Deliveries therefore carry the Svix
headers `svix-id`, `svix-timestamp`, and `svix-signature`. PropelAuth's page doesn't spell out
the headers or secret format; they come from [Svix's verification guide](https://docs.svix.com/receiving/verifying-payloads/how).

You can set up different endpoints for your test and production environments. The Dashboard
also has a full event catalog with example payloads.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `user.created` | A new user signed up | Create a user row, send a welcome email |
| `user.updated` | Some information about the user changed | Re-fetch the user from the API (only `user_id` is recorded) |
| `user.deleted` | A user was deleted | Remove or anonymize local data |
| `org.created` | An organization was created | Create a tenant, provision resources |
| `user.added_to_org` | A user was added to an organization | Update seats and billing |

## All Documented Events

**Organization:** `org.api_key_deleted`, `org.created`, `org.deleted`, `org.saml_removed`,
`org.saml_setup`, `org.saml_went_live`, `org.updated`, `org.scim_key_created`,
`org.scim_key_revoked`, `org.scim_group_created`, `org.scim_group_deleted`,
`org.scim_group_updated`

**User:** `user.added_to_org`, `user.created`, `user.deleted`, `user.deleted_personal_api_key`,
`user.disabled`, `user.enabled`, `user.impersonated`, `user.invited_to_org`, `user.locked`,
`user.logged_out`, `user.login`, `user.removed_from_org`, `user.role_changed_within_org`,
`user.updated`, `user.send_mfa_phone_code`, `user.added_to_scim_group`,
`user.removed_from_scim_group`

**Email** (only if you send your own emails): `email.account_locked`,
`email.confirmation_email`, `email.merge_account_with_sso`, `email.mfa_account_locked`,
`email.org_invite`, `email.org_now_requires_2fa`, `email.otp_login`,
`email.passwordless_login`, `email.reset_password`, `email.update_email`,
`email.waitlist_user_confirmation`, `email.waitlist_user_invitation`

## Event Payload Structure

PropelAuth says each payload includes the relevant information plus the event type. The public
docs page doesn't name the JSON field that holds the type; the examples read `event_type` and
fall back to `type`. Check the event catalog in your Dashboard for the exact shape.

`user.updated` and `org.updated` deliberately carry only an ID (`user_id` / `org_id`) so an
out-of-order delivery can't overwrite newer data. Fetch the latest record from the PropelAuth API.

## Full Event Reference

For the complete list, see [PropelAuth's webhook documentation](https://docs.propelauth.com/integrations/webhooks).
