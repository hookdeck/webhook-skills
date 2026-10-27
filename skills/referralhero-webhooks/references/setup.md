# Setting Up ReferralHero Webhooks

## Prerequisites

- A ReferralHero account with a campaign
- Your application's public webhook endpoint URL (use `npx hookdeck-cli listen 3000 referralhero --path /webhooks/referralhero` for local development)

## Get Your Webhook Secret Key

> Signing is opt-in: turn on Payload Verification for the ReferralHero webhook and paste the Webhook Secret Key. Without it, deliveries are unsigned and fail verification.

1. Open **Edit Campaign > Integrations > Webhooks** and add (or edit) the webhook.
2. Enable the **Payload Verification** toggle. A secret key is generated.
3. Copy the **Webhook Secret Key**. It also appears under the profile menu (Webhook Secret, with regenerate) and on each campaign's **Integration > Webhook** tab.
4. Store it as `REFERRALHERO_WEBHOOK_SECRET`. Use it exactly as shown (UTF-8 bytes, not decoded).

This is not your ReferralHero API key. ReferralHero's code samples name the variable `REFERRALHERO_API_KEY`, but the value is the Webhook Secret Key.

## Register Your Endpoint

1. Enter your endpoint URL (`https://your-app.example.com/webhooks/referralhero`).
2. Toggle on the events you want: `new_registration`, `subscriber_promoted`, `subscriber_updated`, `subscriber_deleted`, `reward_unlocked`, `reward_sent`.
3. Save, then press **Test** to send fake data.

## Delivery Behaviour

- Respond `200` with a blank body. Anything else is an error.
- Failures are retried 3 times over 5 minutes. 10 consecutive bad responses disable the webhook, so re-enable it in the dashboard after fixing your endpoint.
- A webhook belongs to one campaign. Add one per campaign you want to receive events from.
