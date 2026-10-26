# Freemius Webhooks Overview

## What Are Freemius Webhooks?

Freemius is a monetization platform for SaaS, WordPress plugins and themes, and desktop software (checkout, licensing, subscriptions, affiliates). Whenever a monitored **event** occurs on the platform, such as a sale, a license deactivation or a refund, Freemius makes an HTTP `POST` callout carrying the event data to every active webhook whose event filter matches. Each webhook is registered per product under **Webhooks > Listeners** in the Developer Dashboard and receives all event types or a chosen subset.

Every request carries an `x-signature` header (hex HMAC-SHA256 of the raw body, keyed with the product secret key). See [verification.md](verification.md).

## Payload Structure

The Freemius documentation says the payload you receive has the same schema as the API's event resource for that `event.type`, and that the event name is the event's `type` (for example `license.activated`). It does not publish a sample delivery. To see the payload for a type:

1. Open **Webhooks > Events** in the Developer Dashboard and filter by the type.
2. Copy the id of the first event shown.
3. Fetch that event through the Freemius API.

The handlers in this skill read only the top-level `type` (required, a string), and defensively read `id` and `objects` for logging. Treat everything else as untrusted input and check its type before reading into it.

## Common Event Types

Event names follow a `resource.event` pattern. Events on sub-resources such as `payment.dispute.created` do not trigger the parent's `update` event.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `license.activated` | A license is activated | Unlock the product for the customer |
| `license.created` | A license is created | Provision access |
| `license.cancelled` | A license is cancelled | Revoke access |
| `license.expired` | A license expires | Downgrade or notify |
| `subscription.created` | A subscription starts | Create the subscription record |
| `subscription.cancelled` | A subscription is cancelled | Stop renewals in your system |
| `subscription.renewal.failed` | A renewal payment fails | Dunning, notify the customer |
| `payment.created` | A payment is made | Record revenue |
| `payment.refund` | A payment is refunded | Reverse entitlements or accounting |
| `install.installed` | A copy of the product is installed | Track installs |
| `install.uninstalled` | A copy of the product is removed | Churn signals |
| `user.created` | A customer (user) is created | Create the customer record |
| `cart.abandoned` / `cart.completed` | A checkout cart is abandoned or completed | Recovery flows, conversion tracking |

Note: the docs' introduction mentions `subscription.canceled` once in prose, but the event list (and this skill) uses `subscription.cancelled`. Match the list.

## All Documented Event Types

Freemius says this is "a list of all the types of events we currently send" and that more may be added at any time, so don't rely only on these types existing in your code. Handle the few you need and log and acknowledge the rest.

**payment** (6): `payment.dispute.created`, `payment.created`, `payment.refund`, `payment.dispute.closed`, `payment.dispute.lost`, `payment.dispute.won`

**affiliate** (10): `affiliate.approved`, `affiliate.blocked`, `affiliate.created`, `affiliate.deleted`, `affiliate.payout.pending`, `affiliate.paypal.updated`, `affiliate.rejected`, `affiliate.suspended`, `affiliate.unapproved`, `affiliate.updated`

**card** (2): `card.created`, `card.updated`

**cart** (12): `cart.abandoned`, `cart.completed`, `cart.created`, `cart.recovered`, `cart.recovery.deactivated`, `cart.recovery.email_1_sent`, `cart.recovery.email_2_sent`, `cart.recovery.email_3_sent`, `cart.recovery.reactivated`, `cart.recovery.subscribed`, `cart.recovery.unsubscribed`, `cart.updated`

**coupon** (3): `coupon.created`, `coupon.deleted`, `coupon.updated`

**email** (2): `email.clicked`, `email.opened`

**install** (36): `install.activated`, `install.deactivated`, `install.deleted`, `install.connected`, `install.disconnected`, `install.installed`, `install.language.updated`, `install.plan.changed`, `install.plan.downgraded`, `install.platform.version.updated`, `install.premium.activated`, `install.premium.deactivated`, `install.programming_language.version.updated`, `install.sdk.version.updated`, `install.title.updated`, `install.trial.cancelled`, `install.trial.expired`, `install.trial_expiring_notice.sent`, `install.trial.extended`, `install.trial.plan.updated`, `install.trial.started`, `install.uninstalled`, `install.updated`, `install.url.updated`, `install.version.downgrade`, `install.version.upgraded`, `install.extensions.opt_in`, `install.extensions.opt_out`, `install.ownership.candidate.confirmed`, `install.ownership.completed`, `install.ownership.initiated`, `install.ownership.owner.confirmed`, `install.site.opt_in`, `install.site.opt_out`, `install.user.opt_in`, `install.user.opt_out`

**license** (18): `license.activated`, `license.cancelled`, `license.created`, `license.deactivated`, `license.deleted`, `license.expired`, `license.expired_notice.sent`, `license.extended`, `license.ownership.changed`, `license.quota.changed`, `license.renewal_reminder.sent`, `license.shortened`, `license.trial_expiring_notice.sent`, `license.updated`, `license.site.blacklisted`, `license.blacklisted_site.deleted`, `license.site.whitelisted`, `license.whitelisted_site.deleted`

**member** (3): `member.created`, `member.deleted`, `member.updated`

**plan** (4): `plan.created`, `plan.deleted`, `plan.lifetime.purchase`, `plan.updated`

**pricing** (4): `pricing.created`, `pricing.deleted`, `pricing.updated`, `pricing.visit`

**review** (4): `review.created`, `review.deleted`, `review.requested`, `review.updated`

**subscription** (9): `subscription.cancelled`, `subscription.created`, `subscription.renewal_reminder.sent`, `subscription.renewal_reminder.opened`, `subscription.renewal.failed`, `subscription.renewal.failed.last`, `subscription.renewal.failed_email.sent`, `subscription.renewal.retry`, `subscription.renewals.discounted`

**store** (5): `store.created`, `store.dashboard_url.updated`, `store.plugin.added`, `store.plugin.removed`, `store.url.updated`

**user** (17): `user.beta_program.opted_in`, `user.beta_program.opted_out`, `user.billing.updated`, `user.billing.tax_id.updated`, `user.card.created`, `user.created`, `user.email.changed`, `user.email.verified`, `user.email_status.bounced`, `user.email_status.delivered`, `user.email_status.dropped`, `user.marketing.opted_in`, `user.marketing.opted_out`, `user.marketing.reset`, `user.name.changed`, `user.support.contacted`, `user.trial.started`

**webhook** (3): `webhook.created`, `webhook.deleted`, `webhook.updated`

**addon** (2): `addon.free.downloaded`, `addon.premium.downloaded`

**plugin** (8): `plugin.free.downloaded`, `plugin.premium.downloaded`, `plugin.version.deleted`, `plugin.version.deployed`, `plugin.version.released`, `plugin.version.beta.released`, `plugin.version.release.suspended`, `plugin.version.updated`


## Full Event Reference

For the complete, current list, see [Freemius's Events & Webhooks documentation](https://freemius.com/help/documentation/saas/events-webhooks/).
