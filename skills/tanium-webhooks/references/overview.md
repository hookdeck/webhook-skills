# Tanium Connect HTTP Destination Overview

## What Does Tanium Send?

Tanium Connect (Tanium Cloud) moves data out of Tanium to other systems. A **connection** pairs a
**source** (for example a saved question or an event source) with a **destination**. The **HTTP**
destination delivers the source's rows to a URL:

- the rows of the source, with the columns the connection's author selected
- JSON by default, optionally batched into several requests
- on a schedule, manually, or when an event fires
- with the authentication you configure on the destination

Treat this as a webhook receiver: Tanium is the sender, your endpoint is the HTTP destination URL.

## Is There an Event Type?

No. Tanium defines no event strings and no vendor event field. What you receive is determined by
the connection's configuration, so the shape below is **illustrative**, not a Tanium schema:

```json
[
  { "Computer Name": "host-1.example.com", "IP Address": "10.0.0.5", "Operating System": "Windows Server 2022" },
  { "Computer Name": "host-2.example.com", "IP Address": "10.0.0.6", "Operating System": "Ubuntu 24.04" }
]
```

Handle a JSON array of records and a single JSON object, and tolerate an empty body. If you need to
tell connections apart, use a separate URL path or a separate secret per connection.

## Which HTTP Method?

The method is chosen on the destination ("the HTTP method that you want to use for the
request"), so a receiver should not assume `POST`. Tanium's docs don't list the options; the
only method they name is `POST`, in the batching notes. The examples accept `POST`, `PUT` and
`PATCH` for illustration; add whatever method your destination uses.

## How Is the Request Authenticated?

Requests are unsigned. The destination offers these authentication options:

| Option | Covered by this skill / Hookdeck's Tanium source |
|--------|--------------------------------------------------|
| None | No (unauthenticated) |
| Basic Authentication | No |
| OAuth2 Client Credentials | No |
| **Header Authentication** (Auth Header Name + Secret) | **Yes** |
| IBM Cloud IAM | No |

See [verification.md](verification.md) and [setup.md](setup.md).

## Full Reference

[Tanium Connect: HTTP destination](https://help.tanium.com/bundle/ug_connect_cloud/page/userguides/connect/http.html)
