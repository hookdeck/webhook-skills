# ZoomInfo Webhooks Overview

## What Are ZoomInfo Webhooks?

ZoomInfo's Monitoring API lets organizations with Scaling API access subscribe to changes in records they have already enriched through the Enterprise API. Instead of polling, ZoomInfo `POST`s JSON to your target URL when a subscribed contact or company record changes.

## Subscriptions and Events

A webhook has a title, a target URL, a verification token and one or more subscriptions. A subscription is an object type plus an event type:

| Subscription | Object type | Event type | Triggered When |
|--------------|-------------|------------|----------------|
| contact update | Contact | Update | A contact record you have enriched changes |
| company update | Company | Update | A company record you have enriched changes |

**Update is the only supported event type.** The implementation guide lists no create or delete events and no event-type string in the payload.

## Payload Types

Chosen per subscription:

- **Full payload** (default): all fields for the contact or company, including changed attributes.
- **Changed attributes only**: a JSON object listing the changed fields, plus default mapping fields (ID, email, domain).

At most 25 profiles are delivered in a single payload. The default payload used by the Validate step is a full contact payload.

## Delivery Conditions

- Requires access to the Scaling API.
- You must have enriched at least one contact or company through the API to subscribe.
- You only receive updates for records purchased through the API within the past 12 months.
- Records enriched from the ZoomInfo platform (OS) are not covered.

## Full Event Reference

Field-level payload examples are in the Payload Examples of ZoomInfo's API documentation. The setup guide is the [Webhooks Implementation Guide](https://tech-docs-library.zoominfo.com/webhooks-implementation-guide.pdf).
