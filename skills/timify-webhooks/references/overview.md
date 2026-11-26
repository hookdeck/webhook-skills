# TIMIFY Webhooks Overview

## What Are TIMIFY Webhooks?

TIMIFY is an appointment scheduling platform. A webhook subscription in the TIMIFY Developer
Platform sends an HTTP `POST` request to a Server URL you choose when a configured event occurs,
such as creating a booking, deleting a customer or registering an activity. The request body is
JSON event data, so you don't have to poll the API.

Requests are not signed. You can optionally have TIMIFY add a custom header and secret value to
every request (**Include header name**) and check it in your endpoint. See
[verification.md](verification.md).

> Sync-type webhooks, such as Before Confirmations, expect a synchronous answer and aren't supported.

## Common Event Types

TIMIFY names a webhook (the resource) and a type. This is the scope table from TIMIFY's webhook
overview.

| Webhook | Types | Required App Scope | Common Use Cases |
|---------|-------|--------------------|------------------|
| Customers | `Created` `Updated` `Deleted` | `Customers` | Sync your CRM |
| Event | `Created` `Updated` `Deleted` | `Events` `Customers` `Resources` `Services` | Create, reschedule or cancel bookings |
| Events | `Deleted` | `Events` `Customers` `Resources` `Services` | Remove deleted bookings |
| Services | `Created` `Updated` `Deleted` | `Resources` `Services` | Sync the service catalogue |
| Resource | `Created` `Updated` `Deleted` | `Resources` | Sync staff, rooms, equipment |
| Company | `Created` `Updated` `Deleted` | `Companies` | Sync company details |
| Manager | `Created` `Updated` `Deleted` | `BM_Managers` | Sync manager accounts |
| Enterprise | `Updated` | `Enterprises` | Sync enterprise settings |
| Customer Fields | `Created` `Updated` `Deleted` | `Customer fields` | Sync custom customer fields |
| Shift | `Created` `Updated` `Deleted` | `Shift` `Resources` | Sync working hours |
| Notification | `Created` | `Notification` | Forward notifications |
| Service Groups | `Created` `Updated` `Deleted` | `Service Group` | Sync service groups |
| Before Confirmations | `Sync` | `Events` `Customers` `Resources` `Services` | Not supported |
| Before Reminders | `Sync` | `Events` `Customers` `Resources` `Services` | Not supported |

## Event Payload Structure

The body is JSON event data. TIMIFY's overview page does not list the field names or show an
example body, so this skill doesn't describe one. To tell webhooks apart without knowing the
fields, create a separate subscription with its own Server URL for each webhook scope, as TIMIFY
suggests. Otherwise capture a real delivery (for example with the Hookdeck CLI) and branch on the
field it uses. The examples log the top-level fields and acknowledge every request with `200`.

## Full Event Reference

See [TIMIFY's webhook documentation](https://docs.timify.dev/docs/webhooks.md).
