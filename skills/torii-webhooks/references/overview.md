# Torii Webhooks Overview

## What Are Torii Webhooks?

Torii has no native event webhooks. Outbound HTTP requests come from the workflow step
**Custom action (HTTP Request)**. The workflow author defines the method, URL, headers and a JSON
body (with `@` placeholders that Torii fills in). Requests are not signed. You authenticate them
with a secret header the author adds to the custom action.

## Which Events Does Torii Send?

None by name. The vendor adds no event field: what is sent, and when, is decided by the workflow
that contains the step (its trigger) and the body template the author writes. There is no fixed
event list to subscribe to.

The examples dispatch on a `workflow` field that is **illustrative only**. You would put a field
like it into your own body template:

| Illustrative `workflow` value | Example use |
|-------------------------------|-------------|
| `new app discovered` | Open a review ticket for the app |
| `user offboarding` | Revoke access in downstream systems |

## Request Shape

- **Method:** chosen by the workflow author (POST, PUT, PATCH, GET, DELETE). Handle all of them.
- **Headers:** the author's key-value pairs, including the secret header you check.
- **Body:** the author's JSON template; may be empty (for example on a GET).

Illustrative body (not a Torii schema):

```json
{
  "workflow": "new app discovered",
  "app": { "name": "Example App" }
}
```

## Full Reference

See Torii's [Custom Actions article](https://support.toriihq.com/hc/en-us/articles/4824204903067-Custom-Actions).
