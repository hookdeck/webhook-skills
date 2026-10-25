# Cin7 Core Webhooks Overview

## What Are Cin7 Core Webhooks?

Cin7 Core (formerly DEAR Inventory) can POST a JSON payload to a URL you choose when records change. Webhooks require the Automation module and are created through the API with `POST /webhooks`. Requests are not signed: you choose an authorization type (`noauth`, `basicauth` or `bearerauth`) and optional extra headers (`ExternalHeaders`), and Cin7 Core sends them on every delivery. Your endpoint authenticates the request by checking that header.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `Sale/Created` | A sale is created | Sync orders to a warehouse or ERP |
| `Sale/OrderAuthorised` | A sale order is authorised | Start fulfilment |
| `Sale/ShipmentAuthorised` | A sale shipment is authorised | Notify customers, update tracking |
| `Purchase/OrderAuthorised` | A purchase order is authorised | Sync purchasing to accounting |
| `Product/Updated` | A product is updated | Refresh catalogue or pricing |

This is not exhaustive. See the [Cin7 Core API docs](https://dearinventory.docs.apiary.io/) for every webhook `Type`.

## Event Payload Structure

The body is a JSON object with an `EventType` field (the webhook `Type`, e.g. `Sale/Created`) plus event-specific data. Dispatch on `EventType`.

## Delivery and Retries

Cin7 Core makes 6 attempts per delivery, then deactivates the webhook. Respond `200` quickly and process asynchronously.

## Full Event Reference

[Cin7 Core API documentation](https://dearinventory.docs.apiary.io/)
