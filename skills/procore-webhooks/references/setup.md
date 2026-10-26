# Setting Up Procore Webhooks

## Prerequisites

- A Procore company with **Admin** level permissions on the Company level Admin tool
- A public HTTPS endpoint for your receiver (use the Hookdeck CLI locally)

## Create a Hook

1. Open the Company level **Admin** tool.
2. Under **Company Settings**, click **Webhooks**.
3. Click **Create Hook**.
4. Fill in the endpoint configuration:
   - **Endpoint URL**: your receiver, e.g. `https://example.com/webhooks/procore`. Procore
     sends POST requests here.
   - **Authorization Header** (optional): the authorization token Procore places in the
     header of the POST. The docs' example is `Basic c3a24b8208ac5199d083d54a1234e94b8864`.
   - **Payload Format**: the REST API payload version. It cannot be changed after the hook is
     created; delete and re-create the hook to change it.
5. Select the resources and events (create, update, delete) to send.

Company and project administrators can both manage webhooks.

## Store the Credential

Set an Authorization Header (it is optional, but without it nothing authenticates the sender)
and store the exact same string as `PROCORE_AUTHORIZATION`.

Paste the Authorization Header value exactly as set in Procore, including any "Bearer " or
"Basic " prefix. This is also the note Hookdeck's Procore source shows. Do not strip or decode
the prefix: the receiver compares the whole `Authorization` header to this value.

## Local Testing

```bash
npx hookdeck-cli listen 3000 procore --path /webhooks/procore
```

Use the printed URL as the Endpoint URL. For FastAPI, use port `8000`.

## Checking Deliveries

Open the hook to see its status and the Events list (rolling 28 days, with Resource Name,
Resource ID, Event Type, Event Status and UTC timestamp). Filter by resource ID, resource name
or event status, and click an event for details.

## Sending a Manual Test

```bash
curl -X POST http://localhost:3000/webhooks/procore \
  -H "Content-Type: application/json" \
  -H "Authorization: $PROCORE_AUTHORIZATION" \
  -d '{"event_type":"create","resource_name":"RFIs","resource_id":3003}'
```
