# Hostaway Webhooks Overview

## What Are Hostaway Webhooks?

Hostaway is vacation rental software. It can call a URL you provide when data changes. There are the **unified webhook** (Settings > Integrations) and the **legacy** reservation and message webhooks. Requests are not signed. If you set a login and password on the webhook, Hostaway sends them as HTTP Basic auth.

> Set a login and password on the Hostaway webhook. Webhooks without them send nothing to verify.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `reservation.created` | A reservation is created | Sync bookings, trigger guest onboarding |
| `reservation.updated` | A reservation changes | Update dates, status or pricing downstream |
| `message.received` | A guest message arrives | Route to a shared inbox or auto-reply |
| `task.created` | A task is created | Create the matching cleaning or maintenance job |
| `task.updated` | A task changes | Update the matching job |

## Event Payload Structure

The unified webhook payload is **not documented field by field**, and neither page names the HTTP method, the body format or the field that carries the event name. The API changelog says unified webhooks carry the Reservation object, and the help article says each request includes `listingMapId`. Capture a delivery from a test direct booking before you write routing logic.

The examples try a few candidate field names for the event (`event`, `eventType`, or `object` + `action`). These are guesses, not documented fields: replace them with the field you see in a captured delivery, and log the keys of any shape they don't recognise.

## Delivery

- 20-second timeout; transient failures are retried up to 3 times, so handlers must be idempotent.
- Only ports 80 and 443 are reachable.
- Method and body format are undocumented: accept GET, POST, PUT, PATCH and DELETE and tolerate an empty or non-JSON body.

## Full Event Reference

See [Using Hostaway Webhooks](https://support.hostaway.com/hc/en-us/articles/360009022653-Using-Hostaway-Webhooks) and the [Hostaway API documentation](https://api.hostaway.com/documentation). The help article page returns 403 to curl; its text is also served by the Zendesk Help Center API.
