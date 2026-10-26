# ReferralHero Webhooks Overview

## What Are ReferralHero Webhooks?

[ReferralHero](https://referralhero.com) runs referral and waitlist campaigns. A webhook is added per campaign (**Edit Campaign > Integrations > Webhooks**) with the events you want toggled on. When one fires, ReferralHero sends a `POST` with a JSON body to your URL.

## Event Types

The event name is in the body's top-level `response` field.

| Event (`response`) | Triggered When | Common Use Cases |
|--------------------|----------------|------------------|
| `new_registration` | A new subscriber registers | Create a CRM contact, send a welcome email |
| `subscriber_promoted` | A subscriber is promoted | Grant early access, move a waitlist position |
| `subscriber_updated` | A subscriber is updated | Sync changed fields |
| `subscriber_deleted` | A subscriber is deleted | Remove the contact downstream |
| `reward_unlocked` | A subscriber unlocks a reward | Notify the user, queue fulfilment |
| `reward_sent` | A reward is sent | Mark fulfilment complete |

**Known doc conflict:** the docs' `subscriber_updated` example carries `"response": "subscriber_fields_updated"`. The docs do not reconcile the two. The examples in this skill accept both values until a real capture says otherwise.

## Delivery

- Method: `POST`.
- Respond `200` with a blank body. Anything else is treated as an error.
- Failures are retried 3 times over 5 minutes. 10 consecutive bad responses disable the webhook.
- The **Test** button sends fake data.
- Signing is opt-in (see [setup.md](setup.md)). Signed deliveries carry `X-ReferralHero-Signature`.

## Full Event Reference

For payload examples, see [ReferralHero's webhook documentation](https://support.referralhero.com/features/integrations/webhooks).
