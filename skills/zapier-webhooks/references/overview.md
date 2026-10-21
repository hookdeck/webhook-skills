# Zapier Webhooks Overview

## What Are Zapier Webhooks?

"Zapier webhooks" usually means one of two things:

- **Webhooks by Zapier as an action** (this skill): a Zap step that sends an HTTP request to *your* URL whenever the Zap runs. You define the method, payload format, fields and headers.
- **Webhooks by Zapier as a trigger** ("Catch Hook"): Zapier gives *you* a URL to send data to. That's the reverse direction and isn't covered here.

A third, separate product, **Zapier white-label connection webhooks**, is signed with Standard Webhooks. See [verification.md](verification.md#what-about-zapier-white-label-connection-webhooks).

## Action Events

These are the action's events. Each request is one run of a Zap, not a provider event type.

| Action event | What your endpoint receives | Notes |
|--------------|-----------------------------|-------|
| `POST` | POST with the Data fields serialized as the Payload Type | Parses fields for you; can send files |
| `PUT` | PUT, same as POST | Parses fields for you; can send files |
| `GET` | GET with Data as query parameters | For retrieving data; not usually a webhook receiver |
| `Custom Request` | Any method (incl. PATCH, DELETE) with the Data field sent **exactly as typed** | For nested JSON arrays, empty values, unusual headers; no files |

The example handlers accept POST, PUT, PATCH and DELETE on `/webhooks/zapier`, so a Custom Request step works with any of those methods. Add other methods to the route if you need them.

## Payload Types

| Payload Type | Example body | Content-Type |
|--------------|--------------|--------------|
| Form | `first_name=Bryan&last_name=Helmig&age=27` | `application/x-www-form-urlencoded` |
| JSON | `{"first_name": "Bryan", "last_name": "Helmig", "age": 27}` | `application/json` |
| XML | `<first_name>Bryan</first_name>...` | XML |
| Raw | Sent as-is, no fields parsed | whatever you set |

## Event Payload Structure

There is no fixed schema. The body contains:

- The key/value pairs you entered in the **Data** section. A key such as `item__price` becomes nested: `{"item": {"price": "..."}}`.
- If **Data is left blank, every field from the previous step** is sent. That often explains unexpected fields.

Because there's no event type, a common pattern is to add a field yourself (e.g. `event | lead.created`) and dispatch on it. The example handlers do this and fall back to `zap action` when the field is absent.

## Limits and Delivery

- Maximum payload size: **5 MB** for actions.
- Rate limits apply to Webhooks by Zapier.
- A non-2xx response makes the Zap step error; check the Zap run history.
- Static outbound IPs are available on Professional, Team and Enterprise plans if you need an IP allowlist.

## Full Reference

- [Send webhooks in Zaps](https://help.zapier.com/hc/en-us/articles/8496326446989-Send-webhooks-in-Zaps)
