# Braze Webhooks Overview

## What Are Braze Webhooks?

A Braze webhook is an outbound HTTP request that Braze makes to a URL you choose when a user
reaches a **webhook campaign**, a **Canvas webhook step**, or a message built from a **webhook
template**. It is a messaging channel, like email or push: you decide the URL, the HTTP method,
the headers and the body, and you can personalize all of them with Liquid.

This skill does not cover Braze Currents (the event streaming product).

## No Event Types

Braze webhooks have **no event field and no fixed payload**. What your endpoint receives is what
the marketer wrote in the composer, so the "event" is defined by the campaign or Canvas step that
sent it. Include your own discriminator (for example a `type` key) in the body if you need one.

## HTTP Methods

| Method | Use |
|--------|-----|
| `POST` | Writes new information on the receiving server. The most common method |
| `PUT` | Replaces existing information with the request body |
| `GET` | Retrieves information. By definition it has no request body |
| `DELETE` | Deletes the resource named by the URL |

The method depends on the endpoint, so a receiver should accept all of them (this skill's examples
also accept `PATCH`) and cope with an empty body.

## Request Body Styles

- **JSON key-value pairs**: the composer builds a JSON object from the keys and values you enter.
  Example: `{ "message_body": "Your order just arrived!", "user_id": "u_123" }`. Only for endpoints
  that expect JSON.
- **Raw text**: any format (XML, form data, plain text). With `Content-Type:
  application/x-www-form-urlencoded` the body must be a URL-encoded string, such as
  `to=...&text=Your+order+just+arrived`.

Both styles support Liquid personalization and translation tags. Include a default for every
Liquid value, or the rendered body can be malformed.

## Delivery and Retries

| Your response | Marked as received? | Retried? |
|---------------|---------------------|----------|
| `20x` | Yes | n/a |
| `30x` | No | No |
| `408`, `429` | No | Yes |
| Other `4xx` (including `401`) | No | No |
| `5xx` | No | Yes |

Retries: up to five attempts in total, with increasing delay, for up to 24 hours if Braze can't
reach the endpoint. Each request has 120 seconds before it times out. Failures are logged in the
Message Activity Log. Braze only sends to ports 80 and 443.

## Full Reference

See [Braze's webhook documentation](https://www.braze.com/docs/user_guide/message_building_by_channel/webhooks/creating_a_webhook).
