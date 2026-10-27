# Tiltify Webhooks Overview

## What Are Tiltify Webhooks?

Tiltify (tiltify.com) is a charity fundraising platform for streamers and creators. Its developer webhooks push a JSON `POST` to your Webhook Endpoint whenever a donation or a fact (campaign, team campaign, fundraising event, and so on) you subscribed to is updated. You create the endpoint on a Tiltify Application, then add Webhook Subscriptions for the facts you care about.

## Common Event Types

Event types are strings in the form `<scope>:<locality>:<event>`:

- **scope**: `public` (publicly available data, always available) or `private` (adds sensitive fields such as `donor_email` and reward custom-question answers; Developer Dashboard only).
- **locality**: `direct` (events that happen to the subscribed fact) or `indirect` (events on the fact's children, such as the campaigns supporting a team campaign).
- **event**: `donation_updated` (new, moderated or refunded donations) or `fact_updated` (a fact's details or its `amount_raised` changed).

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `public:direct:donation_updated` | A donation to the subscribed fact is created, moderated or refunded | Stream alerts, donation feeds |
| `public:direct:fact_updated` | The subscribed fact or its `amount_raised` changes | Progress bars, totals |
| `private:direct:donation_updated` | Same, with private donation data | Donor receipts, CRM sync |
| `private:direct:fact_updated` | Same, with private data | Internal reporting |
| `public:indirect:donation_updated` | A donation to a child of the subscribed fact | Team or event-wide feeds |
| `public:indirect:fact_updated` | A child of the subscribed fact changes | Team or event-wide totals |
| `private:indirect:donation_updated` | Indirect donation update, private data | Event-wide donor sync |
| `private:indirect:fact_updated` | Indirect fact update, private data | Event-wide reporting |

## Event Payload Structure

Every payload has `data` (the donation or fact) and `meta`. Dispatch on `meta.event_type`.

```json
{
  "data": {
    "amount": { "currency": "USD", "value": "82.95" },
    "campaign_id": "a4fd5207-bd9f-4712-920a-85f8d92cf4e6",
    "completed_at": "2023-04-18T16:48:26.510702Z",
    "created_at": "2023-04-18T03:36:36.510717Z",
    "donor_comment": "Rerum quo necessitatibus voluptas provident ad molestiae ipsam.",
    "donor_name": "Jirachi",
    "fundraising_event_id": null,
    "id": "dfa25dcc-2026-4320-a5b7-5da076efeb05",
    "legacy_id": 0,
    "poll_id": null,
    "poll_option_id": null,
    "reward_id": null,
    "sustained": false,
    "target_id": null,
    "team_event_id": null
  },
  "meta": {
    "attempted_at": "2023-04-18T16:49:00.617031Z",
    "event_type": "public:direct:donation_updated",
    "generated_at": "2023-04-18T16:48:59.510758Z",
    "id": "d8768e26-1092-4f4c-a829-a2698cd19664",
    "subscription_source_id": "00000000-0000-0000-0000-000000000000",
    "subscription_source_type": "test"
  }
}
```

Request headers: `Content-Type: application/json`, `User-Agent: Tiltify Outgoing Webhook`, `X-Tiltify-Timestamp`, `X-Tiltify-Signature`, `X-Tiltify-Endpoint` (the endpoint id), and a version header (`v5` in the docs' example; the docs spell its name `X-Tiltify-Verision`, so don't depend on it).

## Delivery and Retries

Return a `2xx` to acknowledge. Failed deliveries are retried 12 times (2 s doubling to 512 s, then 900 s; about an hour in all). After the 12th retry the endpoint is deactivated and must be re-enabled in the dashboard or through the API. Because `donation_updated` fires for moderation and refunds as well as new donations, the same donation `data.id` arrives more than once; deduplicate on `meta.id`.

## Full Event Reference

See Tiltify's [Types of Events](https://developers.tiltify.com/docs/webhooks/subscriptions/types-of-events) and [Receiving Webhooks](https://developers.tiltify.com/docs/webhooks/receiving-webhooks).
