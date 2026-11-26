# Setting Up Azure Event Grid Webhooks

## Prerequisites

- An Azure subscription with permission to create Event Grid resources
  (the **Event Grid Contributor** role on the topic is enough to create event
  subscriptions)
- Azure CLI with the Event Grid extension, or access to the Azure portal
- A publicly reachable **HTTPS** endpoint. *"Event Grid supports only HTTPS
  webhook endpoints."* Self-signed certificates are **not supported** for
  validation — use a certificate from a commercial CA, or a tunnel (see
  "Local development" below)
- Your endpoint must already implement the validation handshake **before** you
  create the subscription — Event Grid validates at subscription-creation time.
  See [verification.md](verification.md)

## There Is No Signing Secret To Copy

Unlike Stripe, Shopify, or GitHub, there is no dashboard page with a webhook
signing secret. Event Grid does not sign the payload. What you configure instead
is (a) the handshake your endpoint answers and (b) how deliveries authenticate
themselves — a custom header you choose, or Microsoft Entra ID.

## 1. Create a Topic

Custom topic (your own application publishes to it):

```bash
az eventgrid topic create \
  --name my-topic \
  --resource-group my-rg \
  --location eastus
```

For Azure service events (Blob Storage, resource groups, and so on) you don't
create a topic — you subscribe directly to the resource, and Azure creates a
**system topic** for you.

## 2. Create the Event Subscription (WebHook handler)

Event Grid POSTs the validation event as soon as you run this command. If your
endpoint isn't live and answering the handshake, the command fails.

```bash
az eventgrid event-subscription create \
  --name my-webhook-subscription \
  --source-resource-id $(az eventgrid topic show --name my-topic -g my-rg --query id -o tsv) \
  --endpoint https://example.com/webhooks/azure-event-grid \
  --endpoint-type webhook \
  --event-delivery-schema eventgridschema
```

The `--name` you choose here is the value your handler will see in the
`aeg-subscription-name` header. Put it in
`AZURE_EVENT_GRID_SUBSCRIPTION_NAMES` so the handler recognises it.

For a Blob Storage system topic instead:

```bash
storageid=$(az storage account show --name mystorage -g my-rg --query id -o tsv)

az eventgrid event-subscription create \
  --name my-webhook-subscription \
  --source-resource-id $storageid \
  --endpoint https://example.com/webhooks/azure-event-grid \
  --included-event-types Microsoft.Storage.BlobCreated Microsoft.Storage.BlobDeleted
```

### Choosing the delivery schema

| Flag | Payload shape | Handshake your endpoint must answer |
|------|---------------|-------------------------------------|
| `--event-delivery-schema eventgridschema` (default) | JSON **array** | `POST` with `Microsoft.EventGrid.SubscriptionValidationEvent` — echo `validationResponse` |
| `--event-delivery-schema cloudeventschemav1_0` | Single JSON **object** | HTTP **OPTIONS** preflight — return `WebHook-Allowed-Origin` |

Verbatim: *"When you use the CloudEvents schema for output, Event Grid uses the
CloudEvents v1.0 abuse protection in place of the Event Grid validation event
mechanism."* The examples in this skill implement both, so either flag works.

### In the Azure portal

1. Go to your topic (or the Azure resource for a system topic) → **Events** →
   **+ Event Subscription**
2. **Name**: this becomes `aeg-subscription-name`
3. **Event Schema**: *Event Grid Schema* or *Cloud Event Schema v1.0*
4. **Filter to Event Types**: pick the publisher's event types you want
5. **Endpoint Type**: **Web Hook**, then **Select an endpoint** and paste your
   HTTPS URL. The portal runs the validation handshake when you confirm

## 3. Authenticate Deliveries

Pick one. Both are configured on the **event subscription**, not on the topic.

### Option A — a static delivery-property header (shared secret)

You can set **up to 10 custom HTTP headers** per event subscription, each value
**at most 4,096 bytes**. Static values can be flagged **Is secret?** in the
portal, which hides them from users without the right RBAC permission.

```bash
az eventgrid event-subscription create \
  --name my-webhook-subscription \
  --source-resource-id $topicid \
  --endpoint https://example.com/webhooks/azure-event-grid \
  --endpoint-type webhook \
  --delivery-attribute-mapping x-eventgrid-token static "$(openssl rand -hex 32)" true
```

The four positional values are `<name> static <value> <isSecret>`. Set the same
value as `AZURE_EVENT_GRID_DELIVERY_SECRET` (and the name as
`AZURE_EVENT_GRID_DELIVERY_SECRET_HEADER`) in your handler's environment.

Portal equivalent: **Delivery Properties** tab → header name, type **Static**,
value, and tick **Is secret?**.

Rules and gotchas:

- **Never use the `aeg-` prefix** for a custom header name — it is reserved for
  Event Grid's own system properties.
- Header values can also be **dynamic**, taken from the incoming event with
  JsonPath (`--delivery-attribute-mapping Channel dynamic data.system`). Only
  JSON string, number, and boolean values are supported. Dynamic values are for
  routing metadata, never for secrets.
- The docs' own (explicitly non-normative) example sets
  `Authorization: BEARER SlAV32hkKG...` as a static header. That is usable only
  when you are **not** protecting the webhook with Microsoft Entra ID — the two
  would collide on the same header. Prefer a distinct custom header name.
- **Non-conformant values in well-known headers cause the header to be dropped
  during event delivery to webhook destinations, but not during webhook
  validation.** A malformed `Authorization` value therefore passes the handshake
  and then silently vanishes on real deliveries, which looks like your handler
  suddenly rejecting everything. Another reason to use a custom header name.

### Option B — client secret as a query parameter

Documented in [Authenticate event delivery](https://learn.microsoft.com/en-us/azure/event-grid/security-authentication)
as a first-class method for webhook handlers, alongside Entra ID.

Append the secret to the endpoint URL when you create the subscription. *"Event
Grid service includes all the query parameters in every event delivery request
to the webhook. The webhook service can retrieve and validate the secret."*

```bash
az eventgrid event-subscription create \
  --name my-webhook-subscription \
  --source-resource-id "$TOPIC_ID" \
  --endpoint "https://example.com/webhooks/azure-event-grid?token=$SECRET" \
  --endpoint-type webhook
```

Azure treats these with care: query parameters are *"stored as encrypted and
aren't accessible to service operators"*, *"aren't logged as part of the service
logs or traces"*, and are not returned when you read the subscription back —

```bash
# Without this flag the query string is stripped from the output.
az eventgrid event-subscription show --name my-webhook-subscription \
  --source-resource-id "$TOPIC_ID" --include-full-endpoint-url
```

**Rotating the secret needs an overlap window.** From the same page: *"If you
update the client secret, you also need to update the event subscription. To
avoid delivery failures during this secret rotation, make the webhook accept
both old and new secrets for a limited duration before updating the event
subscription with the new secret."* The examples take a comma-separated list for
exactly this reason:

```bash
# 1. Deploy the receiver accepting both.
AZURE_EVENT_GRID_QUERY_SECRET=<old>,<new>
# 2. Update the event subscription's endpoint URL to carry <new>.
# 3. Once deliveries are landing on <new>, drop <old> and redeploy.
```

Reversing steps 1 and 2 drops every delivery in the gap.

### Option C — Microsoft Entra ID protected endpoint

Configure the subscription with your Entra tenant and application:

```bash
az eventgrid system-topic event-subscription create \
  --name my-webhook-subscription \
  -g my-rg \
  --system-topic-name my-system-topic \
  --endpoint https://example.com/webhooks/azure-event-grid \
  --endpoint-type webhook \
  --event-delivery-schema eventgridschema \
  --azure-active-directory-tenant-id <TENANT_ID> \
  --azure-active-directory-application-id-or-uri <APPLICATION_ID_OR_URI>
```

Portal equivalent: **Additional features** tab → **Use Microsoft Entra
authentication**, then fill in the tenant ID and application ID (or Application
ID URI).

Before this works you must run Microsoft's setup script, which assigns the
Event Grid service principal the **`AzureEventGridSecureWebhookSubscriber`**
role on your webhook's Entra application. Since **March 30, 2021** an extra
access check applies: *"The subscriber client's service principal needs to be
either an owner or have a role assigned on the destination application service
principal."* If you see `Authorization_RequestDenied` when creating the
subscription, that check is what failed.

Once configured: *"Event Grid is now passing the Microsoft Entra bearer token to
the webhook client in every message. You need to validate the authorization
token in your webhook."* See [verification.md](verification.md) for the
validation code.

### What is not available

- There is **no documented source-IP allowlist** for Event Grid webhook
  delivery. Azure publishes service tags for *inbound-to-Azure* scenarios; that
  is a different thing and is not an egress allowlist for Event Grid webhook
  delivery. Don't build one from guessed ranges.
- There is **no payload signature** of any kind, in any mode. If you want
  cryptographic proof of origin rather than a shared credential, Microsoft Entra
  ID (Option C) is the only supported answer.

## 4. Tune Delivery (optional)

```bash
az eventgrid event-subscription update \
  --name my-webhook-subscription \
  --source-resource-id $topicid \
  --max-delivery-attempts 10 \
  --event-ttl 120 \
  --deadletter-endpoint /subscriptions/{sub}/resourceGroups/{rg}/providers/Microsoft.Storage/storageAccounts/{sa}/blobServices/default/containers/{container}
```

- `--max-delivery-attempts` 1–30 (default 30)
- `--event-ttl` 1–1440 minutes (default 1440); whichever limit is hit first stops delivery
- Dead-lettering is off by default and needs a storage account container
- Batching: `--max-events-per-batch` (1–5,000) and
  `--preferred-batch-size-in-kilobytes` (1–1,024). Off by default; turning it on
  means your handler must process the whole array or fail the whole batch

## 5. Local Development

Event Grid needs a publicly reachable HTTPS URL with a CA-signed certificate, so
you cannot point a subscription at `localhost`. With Hookdeck, create a source
with the **Azure Event Grid** type in the dashboard, then forward it with the
Hookdeck CLI:

```bash
hookdeck login
hookdeck listen 3000 <your-azure-event-grid-source-name> --path /webhooks/azure-event-grid
```

Use the source's URL as `--endpoint`. The source answers the CloudEvents
`OPTIONS` preflight; for an Event Grid schema subscription, open the
`validationUrl` from the logged validation event within 10 minutes, because
your handler's response doesn't go back to Azure. Then publish a test event to your
custom topic:

```bash
topicendpoint=$(az eventgrid topic show --name my-topic -g my-rg --query "endpoint" -o tsv)
key=$(az eventgrid topic key list --name my-topic -g my-rg --query "key1" -o tsv)

curl -X POST "$topicendpoint" \
  -H "aeg-sas-key: $key" \
  -H "Content-Type: application/json" \
  -d '[{
    "id": "1",
    "eventType": "Contoso.Items.ItemReceived",
    "subject": "Contoso/foo/bar/items",
    "eventTime": "2026-08-24T01:00:00.0000000Z",
    "data": { "itemSku": "Standard" },
    "dataVersion": "1.0"
  }]'
```

### If the handshake goes wrong

- **Provisioning state `AwaitingManualAction`** — you returned 200 but didn't
  echo the code. GET the `validationUrl` from the validation event within
  **10 minutes**. That URL uses **port 553**; if your firewall blocks 553 the
  manual handshake can't complete.
- **Provisioning state `Failed`** — the 10 minutes elapsed, or the handshake
  errored. You must **create the event subscription again**; it can't be
  resumed.
- **Handshake times out** — the HTTP request must complete within 30 seconds.
  Event Grid cancels and reattempts after 5 seconds; repeated failure is a
  validation handshake error.
- **Certificate errors** — self-signed certificates aren't supported for
  validation.

## Test Mode vs Live Mode

Event Grid has no separate test mode. The usual approach is a second event
subscription (a different `--name`) pointed at a staging endpoint, filtered with
`--included-event-types` or `--subject-begins-with` so it only receives what you
want to exercise. Because your handler checks `aeg-subscription-name`, add the
staging subscription's name to `AZURE_EVENT_GRID_SUBSCRIPTION_NAMES` in the
staging environment only.
