# Setting Up PagerDuty Webhooks

## Prerequisites

- A PagerDuty account.
- A **REST API token** (user or account-level) or an OAuth token with
  permission to manage webhook subscriptions. Admin/manager-level access is
  needed to create subscriptions for an account-wide filter.
- Your application's webhook endpoint URL, publicly reachable over HTTPS.
- The service, team or account id you want to scope the subscription to.

## There Is No Dashboard-Only Signing Secret

PagerDuty V3 webhooks are created through the **Webhook Subscriptions REST
API**, and the signing secret is **returned once, in the create response**. It
is not an API key, not a REST token, and not an Events API routing key. There is
no page where you can re-read an existing subscription's secret later — if you
lose it, create a new subscription and delete the old one.

PagerDuty's web app has a **webhooks dashboard** for viewing and enabling or
disabling subscriptions, but creation and the secret live in the API.

## Create a Webhook Subscription

`POST https://api.pagerduty.com/webhook_subscriptions`
(EU accounts: `https://api.eu.pagerduty.com/webhook_subscriptions`)

```bash
curl -X POST https://api.pagerduty.com/webhook_subscriptions \
  -H 'Authorization: Token token=YOUR_API_TOKEN' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json' \
  -d '{
    "webhook_subscription": {
      "type": "webhook_subscription",
      "delivery_method": {
        "type": "http_delivery_method",
        "url": "https://example.com/webhooks/pagerduty",
        "custom_headers": [
          { "name": "your-header-name", "value": "your-header-value" }
        ]
      },
      "description": "Sends PagerDuty v3 webhook events somewhere interesting.",
      "events": [
        "incident.triggered",
        "incident.acknowledged",
        "incident.unacknowledged",
        "incident.escalated",
        "incident.delegated",
        "incident.reassigned",
        "incident.priority_updated",
        "incident.annotated",
        "incident.responder.added",
        "incident.responder.replied",
        "incident.status_update_published",
        "incident.reopened",
        "incident.resolved"
      ],
      "filter": {
        "type": "service_reference",
        "id": "P393ZNQ"
      }
    }
  }'
```

Reference:
[Create a webhook subscription](https://docs.pagerduty.com/developer/api/reference/rest/webhooks/create-webhook-subscription).

## Capture the Secret from the Response

The response body contains the subscription, including:

```json
{
  "webhook_subscription": {
    "id": "PWHSUB1",
    "type": "webhook_subscription",
    "active": true,
    "delivery_method": {
      "type": "http_delivery_method",
      "url": "https://example.com/webhooks/pagerduty",
      "secret": "<THIS IS THE SIGNING SECRET — STORE IT NOW>"
    },
    "events": ["incident.triggered", "..."],
    "filter": { "type": "service_reference", "id": "P393ZNQ" }
  }
}
```

**`delivery_method.secret` is the HMAC key.** Store it in your secret manager
and expose it to your app as `PAGERDUTY_WEBHOOK_SECRET`. Use it **as-is** as
UTF-8 bytes — do not base64-decode or hex-decode it.

```bash
PAGERDUTY_WEBHOOK_SECRET=the-secret-from-delivery_method.secret
```

## Choosing a Filter

The `filter` determines which events match and produce a webhook. Three types:

| `filter.type` | Scope |
|---|---|
| `service_reference` | Events for incidents belonging to that one service |
| `team_reference` | Events for incidents belonging to that team |
| `account_reference` | Everything in the account |

PagerDuty: *"In the case of incident events, the different filter types will only
produce webhooks for the incidents that are associated with the filter object."*
Start with `service_reference` while developing; `account_reference` on a busy
account is a lot of traffic.

## Choosing Events

The `events` array can be any subset of the
[30 V3 event types](overview.md#common-event-types). **Subscribe only to what
you handle** — every extra event type is traffic you pay for in latency and
log noise.

PagerDuty may add new event types over time, and may ship
[Early Access events](https://docs.pagerduty.com/developer/early-access-webhooks)
without notice. Those also have to be requested explicitly in `events`, but your
handler still needs a default branch — an account can have more than one
subscription, and lists change.

**`pagey.ping` is not subscribable.** It is not in the event types list and
cannot be put in `events`, but it *will* arrive — signed, with a `resource_type`
and `data` shape unlike any documented event — whenever someone calls
[`POST /webhook_subscriptions/{id}/ping`](#verify-your-endpoint-is-reachable).
It has to fall through your default branch.

## Custom Headers

`custom_headers` are optional static headers delivered with every payload:

```json
"custom_headers": [
  { "name": "x-my-tenant", "value": "acme" }
]
```

- Header names must be **unique within a subscription**.
- Values are **redacted in GET API responses** but are **not redacted on
  delivery** — your endpoint receives them verbatim.
- A shared-secret header is possible this way, but it is **not a substitute for
  `X-PagerDuty-Signature`**. It proves the sender knows a static string; it
  says nothing about whether the body was modified in transit.

## OAuth 2.0 Instead of (or Alongside) Signatures

A subscription can be associated with an OAuth client so deliveries carry a
bearer token. Retry behaviour differs:

- An **invalid or deleted OAuth client** is a *temporary* error and is retried
  normally.
- A **401** from your endpoint makes PagerDuty refresh the token and retry
  immediately.
- If the refresh **fails** (OAuth server unavailable, network issues) that is a
  temporary error on the normal retry schedule.
- A **second 401 after a successful refresh** is **permanent** — the webhook is
  dropped with no further retries.

Still verify the signature. The bearer token authenticates the caller; only the
signature protects the body.

## Verify Your Endpoint Is Reachable

PagerDuty sends **no handshake, challenge or validation request** — the only
unsolicited delivery you can trigger is an explicit `pagey.ping` test via the
ping endpoint. To get a genuine signed delivery:

1. Point the subscription at a tunnel:

   ```bash
   npx hookdeck-cli listen 3000 pagerduty --path /webhooks/pagerduty
   ```

   No account required — the CLI creates a guest account on first run and prints
   a public HTTPS URL plus a web UI for inspecting each request (raw body and
   `X-PagerDuty-Signature` included). Use `8000` for the FastAPI example.

2. Use the printed URL as `delivery_method.url` on the subscription.

3. Fire a test event at the subscription:

   ```bash
   curl -X POST https://api.pagerduty.com/webhook_subscriptions/PWHSUB1/ping \
     -H 'Authorization: Token token=YOUR_API_TOKEN'
   ```

   PagerDuty returns `202 Accepted` and, *"if properly configured, this will
   deliver the `pagey.ping` webhook event to the destination"* — a real delivery
   through the subscription's delivery method, so it exercises the whole path.
   PagerDuty does not document whether the ping carries
   `X-PagerDuty-Signature`; expect it to, but confirm against your own logs
   before treating a signed ping as a guarantee. Requires the
   `webhook_subscriptions.write` scope. See
   [Test a webhook subscription](https://docs.pagerduty.com/developer/api/reference/rest/webhooks/test-webhook-subscription).

   `pagey.ping` is **not** in the [Event Types](overview.md#common-event-types)
   table and is not something you subscribe to — it only arrives from this
   endpoint, carrying a `resource_type` and `data` shape you have never seen. It
   must **fall through your default branch**, not throw.

4. For real traffic, trigger an incident on the filtered service — e.g. send a
   test event to the service's Events API v2 integration, or use **New
   Incident** in the PagerDuty web app. Then acknowledge and resolve it to
   exercise `incident.acknowledged` and `incident.resolved`.

## Managing Subscriptions

| Action | Endpoint |
|---|---|
| List | `GET /webhook_subscriptions` |
| Read one | `GET /webhook_subscriptions/{id}` (header values and the secret are redacted) |
| Update | `PUT /webhook_subscriptions/{id}` |
| Delete | `DELETE /webhook_subscriptions/{id}` |
| Enable | `POST /webhook_subscriptions/{id}/enable` |
| Ping/test | `POST /webhook_subscriptions/{id}/ping` (requires `webhook_subscriptions.write`) |

There is **no rotate endpoint** — see [Secret rotation](#secret-rotation).

### Re-enabling a disabled subscription

After **3 consecutive dropped** webhooks, PagerDuty disables the subscription
for **24 hours** and drops its queued webhooks. In the web app it is tagged
**"Needs Attention"** on the webhooks dashboard — click **Enable** on the
subscription's settings page, or call the "Enable a webhook subscription" REST
endpoint.

The usual cause is your endpoint returning 5xx or timing out past the 5-second
budget. Verify, enqueue, return `202` — don't do the work inline.

## Secret Rotation

`X-PagerDuty-Signature` can carry **multiple `v1=` signatures**, one per active
secret, specifically so a rotation needs no downtime. During a rotation window
PagerDuty signs the same body once per active secret and concatenates the
results with commas.

**Your verifier must therefore accept a match against *any* `v1=` entry**, which
is what the examples in this skill do. A verifier that compares the whole header
string, or only the first entry, breaks the moment a rotation starts. Details in
[verification.md](verification.md).

There is **no customer-facing rotate endpoint** — rotation is initiated by
PagerDuty, which is why the header can carry several signatures during the
window. If you lose the secret, create a replacement subscription and delete the
old one.

## Mutual TLS (Recommended by PagerDuty)

This is server configuration, not application code. PagerDuty presents a client
certificate on request; you trust the **DigiCert Global Root G2**, set verify
depth **2**, and check the client cert Subject CN. Client certs rotate
**yearly** — pin the root, not the leaf. nginx and Apache snippets are in
[verification.md](verification.md#mutual-tls).

PagerDuty also verifies *your* server certificate: it must chain to a CA in
Mozilla's included-CA list (self-signed certificates are dropped), the chain must
be presented **in order**, and PagerDuty's delivery system supports **TLS v1.2
only**.

## IP Safelists (Defence in Depth)

PagerDuty publishes the webhook egress IPs per region. They are **shared across
all customers and subject to change**, so fetch them at runtime rather than
hardcoding:

- US: <https://docs.pagerduty.com/ip-safelists/webhooks-us-service-region>
  ([JSON](https://docs.pagerduty.com/ip-safelists/webhooks-us-service-region-json))
- EU: <https://docs.pagerduty.com/ip-safelists/webhooks-eu-service-region>
  ([JSON](https://docs.pagerduty.com/ip-safelists/webhooks-eu-service-region-json))

These are the **webhook + workflow-action** IPs and are **different** from the
[REST API IPs](https://docs.pagerduty.com/developer/rest-api-ips). Don't mix the
two lists.

## Basic Auth in the URL

Supported: `https://username:password@app.example.com`. Special characters such
as `@` must be percent-encoded — `https://username:long%20password@example.com`.
Mentioned for completeness; the signature is the credential that matters.

## Migrating from V1/V2 Extensions

- **V1** extensions reached end-of-life in **October 2022** — they no longer
  function.
- **V2** extensions reached end-of-support on **31 October 2022**. They still
  work (no EOL date set) but get no fixes or features. Their payload is a
  `messages[]` array with event strings like `incident.trigger` (singular), and
  they are **not** signed with `X-PagerDuty-Signature`.

Use PagerDuty's
[migration guide](https://docs.pagerduty.com/integrations/webhooks#migration-guide)
or its
[migration script](https://github.com/PagerDuty/public-support-scripts/tree/master/migrate_webhooks_to_v3)
(provided as-is). After migrating, update your handler's event names to the V3
past-tense forms (`incident.triggered`, not `incident.trigger`) and add
signature verification.

## Checklist

- [ ] Subscription created via `POST /webhook_subscriptions`
- [ ] `delivery_method.secret` captured and stored as `PAGERDUTY_WEBHOOK_SECRET`
- [ ] Handler reads the **raw** body and verifies `X-PagerDuty-Signature`
- [ ] Handler accepts a match on **any** `v1=` entry (rotation-safe)
- [ ] Handler returns `202` fast and processes asynchronously (5-second budget)
- [ ] Signature failures return **4xx**, never 5xx
- [ ] Unset secret fails **closed** (500, never "skip verification")
- [ ] De-duplication keyed on `X-Webhook-Id`, retained 48+ hours
- [ ] Default branch for unknown `event_type` values
