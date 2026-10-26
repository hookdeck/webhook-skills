# Payrix Pro Webhooks Overview

## What Are Payrix Pro Webhooks?

Payrix Pro is Worldpay's payment facilitation platform (not Payrix Payments). A webhook is set up
as an alert with one or more actions; an action has an Endpoint (your URL) and optionally a header
name and header value. When the alert fires, Payrix Pro calls the Endpoint and sends that header.

Requests are **not signed**. The only authentication is the secret header you add to each action.

## Which Alerts Can Fire?

Payrix's webhook documentation does not list event-type strings; you choose which alerts to create
in the Payrix Pro portal, and each alert defines what triggers it. This skill therefore does not
invent event names. Typical examples are alerts on transactions and merchants:

| Alert (illustrative) | Triggered When | Common Use Cases |
|----------------------|----------------|------------------|
| Transaction alert | A transaction you configured the alert for occurs | Reconcile payments, notify staff |
| Merchant alert | A merchant record you configured the alert for changes | Sync onboarding status |

## Payload Structure

Not documented, and the action has its own format (Content-Type) setting, so the body may be JSON
or another format. Illustrative transaction alert (not an official sample):

```json
{ "alert": "transaction", "transaction": { "id": "t1_txn_example", "total": 1500 } }
```

The examples parse JSON when the content type says so and otherwise keep the raw text.

## Method

The HTTP method is not documented. Accept GET, POST, PUT, PATCH and DELETE.

## Full Reference

See [Payrix's webhook documentation](https://resource.payrix.com/docs/set-up-webhooks).
