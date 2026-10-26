# Rebrandly Webhooks Overview

## What Are Rebrandly Webhooks?

Rebrandly sends click data for your branded short links to an endpoint you control. Two
products exist: enterprise **Clickstream** webhooks (configured with Rebrandly; you provide the
endpoint URL, the HTTP method POST or PUT, and an authentication header key and value) and the
self-serve **Webhooks** feature in account settings.

Requests are not signed. The sender adds the authentication header you chose.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `click` | A short link is clicked | Analytics pipelines, attribution, real-time dashboards |

Only click events exist; there is no event-type field. Each event is sent once, with no retries,
so acknowledge quickly and queue the work.

## Event Payload Structure

```json
{
  "data": [
    {
      "timestamp": "2019-07-02T14:07:06.981094Z",
      "client": {
        "language": "pt",
        "location": { "country": "br" },
        "agent": {
          "browser": { "name": "facebook-app", "version": "227.0.0.43.158" },
          "os": { "name": "android", "version": "android-9.0-pie" },
          "device": { "name": "smartphone" },
          "type": "human"
        },
        "session": { "started": "2019-07-02T14:07:06.981094Z", "first": true }
      },
      "referral": {
        "hostname": "m.facebook.com", "protocol": "http", "path": "/",
        "origin": { "type": "social", "name": "facebook" }
      },
      "route": {
        "id": "a1ec86bf91bfe763ad02f602259ea0a9",
        "slashtag": "",
        "creator": { "id": "wf09bfww4eb9jkw2844555e1ce9af4f2", "workspace": { "id": "d88bfe5fgd14b2ghb44538b9aekpw89", "name": "" } },
        "domain": { "id": "9a5ae320f3e247ef8c9b6061131bb517", "raw": "" },
        "destination": { "raw": "https://www.yourdestination.com/?utm_source=cs_facebook_post", "protocol": "https", "hostname": "www.yourdestination.com", "path": "/" }
      }
    }
  ],
  "key": "abcxyz123"
}
```

`data` is an array: one request can carry many clicks, so loop over it.

## Full Event Reference

See Rebrandly's [Clickstream webhooks](https://developers.rebrandly.com/docs/clickstream-webhooks)
and [setup](https://developers.rebrandly.com/docs/clickstream-webhook-setup) documentation.
