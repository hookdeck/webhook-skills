# Cyberimpact Webhooks Overview

## What Are Cyberimpact Webhooks?

Cyberimpact is an email marketing platform. Its marketing automation feature (included in some
plans) has a **Send a webhook** action. When a contact reaches that step in a scenario,
Cyberimpact sends an HTTP `POST` with a JSON body to the URL you configured. Typical triggers
are a subscription form signup, a contact added to a group, an email open or link click, a survey
response, a contact date being reached, a profile update, or consent about to expire.

The request is **not signed**. You authenticate it with a header you define yourself (see
[verification.md](verification.md)).

## Common Event Types

Only one event name is documented:

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `automation.webhook.send` | A contact reaches a Send a webhook step in a scenario | Add the contact to a CRM, send a Slack or Teams alert, trigger an SMS or email elsewhere |

## Event Payload Structure

The Test button sends this body:

```json
{
  "id": "test_evt_GppedVq2CWTWxUUxrm26bic0C",
  "event": "automation.webhook.send",
  "timestamp": "2024-05-28T12:56:40Z",
  "idClient": 3,
  "data": { "type": "member", "id": 54321, "email": "john.doe@example.org", "firstname": "John", "lastname": "Doe" }
}
```

| Field | Meaning |
|-------|---------|
| `id` | Event id (use it for idempotency) |
| `event` | Always `automation.webhook.send` |
| `timestamp` | ISO 8601 time |
| `idClient` | Your Cyberimpact account id |
| `data` | The contact (`type: "member"`, `id`, `email`, `firstname`, `lastname`, ...) |

The author of the scenario picks what goes in **Data to be transmitted**: contact details,
consent information, the contact's mailing statistics, the contact id, custom fields, and group
list. They can also add **Additional information** key-value pairs, where the value can be a fixed
string or a field placeholder. Send a real delivery to see where each lands.

## Delivery Behavior

- Method is `POST`; the Test button treats `200` as accepted.
- If a request isn't accepted, it is **Pending** and Cyberimpact retries for the next 12 hours,
  then marks it **Failed**.
- The contact moves on to the next scenario step after the first attempt, whether or not the
  request was accepted.
- Per-step statistics (accepted, pending, failed) are in the scenario view.

## Full Event Reference

See Cyberimpact's article [Send webhooks from a scenario to a third-party application](https://faq.cyberimpact.com/en/articles/1418).
