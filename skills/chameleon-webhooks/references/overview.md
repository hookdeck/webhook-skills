# Chameleon Webhooks Overview

## What Are Chameleon Webhooks?

Chameleon (chameleon.io) is an in-app product adoption platform: Tours, Microsurveys, Embeds,
Demos, the HelpBar and Alerts. Outgoing webhooks push real-time events about those Experiences to
your HTTPS endpoint. You configure endpoints, each with the topics it wants, on the
Integrations -> Webhooks page of the Chameleon dashboard.

Each delivery is a `POST` with a JSON body. Chameleon sends it right away from AWS us-east with a
7-second timeout, signs the raw body with HMAC-SHA256 (`X-Chameleon-Signature`), and retries a
non-200 response 9 times over 43 hours. Any 2xx counts as success. Respond quickly and do heavy work
asynchronously.

## Common Event Types

The topic is the body's `kind` field.

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `ping` | Chameleon checks the endpoint is working | Nothing to do beyond verifying it |
| `tour.started` | A Tour starts (includes the first Step) | Funnel tracking |
| `tour.completed` | A Tour is completed | Mark onboarding done in your CRM |
| `tour.exited` | A Tour is exited (includes the exited Step) | Find drop-off Steps |
| `tour.snoozed` | A Tour is exited on a Step configured to snooze | Re-engagement |
| `tour.button.clicked` | A Tour button is clicked | Custom button actions |
| `survey.started`, `survey.completed`, `survey.exited`, `survey.snoozed`, `survey.button.clicked` | The Microsurvey lifecycle | Survey analytics |
| `response.finished` | A Microsurvey is finished (all Steps, plus any text comment) | Store NPS/CSAT answers |
| `embed.started`, `embed.completed`, `embed.exited`, `embed.snoozed`, `embed.button.clicked` | The Embed lifecycle | Embedded content analytics |
| `demo.started` | A Demo is started | Lead tracking |
| `demo.reveal` | A Demo started with Clearbit reveal and a company matched | Enrich leads (`reveal_domain`, `reveal_name`) |
| `demo.finished` | The last step was reached, or about 30 minutes passed (`finished_kind` is `last_step` or `timeout_30m`) | Score engagement |
| `demo.form.submitted` | A Demo form is submitted | Capture leads |
| `demo.email.added` | An email is added to a Demo run (shown only in an example; sent once per updated run) | Capture leads |
| `helpbar.search` | HelpBar search results are displayed | Search analytics |
| `helpbar.answer` | A search generates an AI Answer | Find content gaps |
| `helpbar.item.action` | A HelpBar item is clicked or actioned | Item popularity |
| `helpbar.item.error` | A HelpBar item's action throws an error | Alerting |
| `alert.triggered` | An Alert's conditions are violated | Notify your team |

## Event Payload Structure

```json
{
  "id": "5fb70dcbc39330000325a817",
  "kind": "ping",
  "sent_at": "2029-12-11T00:28:59.650Z",
  "data": {
    "account": { "id": "58918bc07de121000432e9c0", "domain": "acme.co", "name": "Acme Corp" }
  }
}
```

- `id`: the Chameleon ID of the webhook (also sent as the `X-Chameleon-Id` header). Use it to dedupe.
- `kind`: the topic.
- `sent_at`: server time when it was sent. It isn't signed separately; it is just part of the body.
- `data`: the included models by singular or plural name, e.g. `profile`, `tour`, `step`, `action`,
  `survey`, `response`.

Other headers: `User-Agent: Chameleon Webhooks/v3 (...)`, `Content-Type: application/json`.

## Full Event Reference

For the complete list and payload examples, see
[Chameleon's outgoing webhooks documentation](https://developers.chameleon.io/webhooks/outgoing).
