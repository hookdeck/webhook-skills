# Deliverect Webhooks Overview

## What Are Deliverect Webhooks?

Deliverect (deliverect.com) is an order and menu hub between ordering channels, POS systems and
couriers. Your integration (a channel, POS, dispatch or retail partner) receives Deliverect's calls on
the URLs you register. A channel's `/register` response returns one URL per webhook kind.

Each operational webhook expects a `200 OK`. Retries and timeouts are not described on the pages
this skill was built from, so make handlers idempotent and fast.

## Which Webhook Kinds Exist?

Deliverect has **no event-name field or header**. The kind of call is chosen by the URL you
registered for it. The examples use a single route plus an optional path segment:

| Kind (path segment) | Registered URL field | Typical purpose |
|---------------------|----------------------|-----------------|
| `order_status_update` | `statusUpdateURL` | An order's status changed |
| `menu_update` | `menuUpdateURL` | A menu was published or updated |
| `snooze_unsnooze` | `snoozeUnsnoozeURL` | Items were snoozed or unsnoozed |
| `busy_mode` | `busyModeURL` | A location was paused or put back online |

The path-segment names are this skill's own convention (hyphens are accepted too, so
`/webhooks/deliverect/busy-mode` works). Other URL fields exist for other integration types; a call
to a path with no recognised kind is verified and then acknowledged as unhandled.

## Request Methods

Most calls are `POST` with a JSON body, but **some signed calls are `GET` with no body**. For those
the HMAC is computed over the empty string. Your route must therefore accept more than `POST`, and
verification must treat a missing body as zero bytes.

## Payload Fields

The fields the examples read (`orderId`, `status`, `menus`, `operations`, `action`, `data.items`) are
**illustrative**. Check the payload for your integration type in the
[Deliverect developer docs](https://developers.deliverect.com). The examples treat every field of a
verified body as untrusted and check its type before use.

## Authentication of Incoming Calls

Calls are authenticated with an HMAC-SHA256 signature in `x-server-authorization-hmac-sha256`.
See [verification.md](verification.md). (Deliverect's OAuth-style access token is for calls **you**
make to Deliverect's APIs, not for incoming webhooks.)

## Full Reference

[Deliverect HMAC Authentication](https://developers.deliverect.com/reference/hmac-authentication)
