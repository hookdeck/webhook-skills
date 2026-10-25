# Setting Up a Tanium Connect HTTP Destination

## Prerequisites

- A Tanium Cloud instance with Tanium Connect and permission to create connections
- A publicly reachable HTTPS endpoint (locally, run
  `npx hookdeck-cli listen 3000 tanium --path /webhooks/tanium`)

## Choose a Header Name and Secret

Pick a header name (for example `Authorization` or `X-Tanium-Secret`) and generate a long random
value for the secret. Store them as:

```bash
TANIUM_WEBHOOK_HEADER=X-Tanium-Secret
TANIUM_WEBHOOK_SECRET=<the exact secret value>
```

If you type `Bearer abc123` as the Secret, `TANIUM_WEBHOOK_SECRET` must be `Bearer abc123`: the
whole value is compared, and no prefix is parsed.

## Create the HTTP Destination

1. In Tanium, open **Connect** and create a connection (or edit one).
2. Choose a **source** and the columns to send.
3. Add an **HTTP** destination and enter your endpoint URL.
4. Under authentication, select **Header Authentication** and enter the **Auth Header Name** and
   **Secret**. Connect sends them as an HTTP request header on every delivery.
5. Choose the HTTP method and whether to batch the data into several requests. Tanium's docs
   don't list the method options; they mention only `POST` (a batch size "creates multiple POST
   requests").
6. Set the schedule, or run the connection manually, then save.

Basic Authentication, OAuth2 Client Credentials and IBM Cloud IAM are also offered by Tanium but
are not covered here or by Hookdeck's Tanium source.

## Using Hookdeck

Create a **Tanium** source in Hookdeck (type `TANIUM`), set the same Header Name and Header Value
(the exact whole value), and use the Hookdeck source URL as the destination URL. The source
pre-selects `POST` without managing the method: if the destination uses another method (for
example `PUT` or `PATCH`), also allow that method on the source.

## Test

```bash
curl -X PUT http://localhost:3000/webhooks/tanium \
  -H "Content-Type: application/json" \
  -H "$TANIUM_WEBHOOK_HEADER: $TANIUM_WEBHOOK_SECRET" \
  -d '[{"Computer Name":"host-1.example.com","IP Address":"10.0.0.5"}]'
```

## Network Notes

Rely on the secret header and HTTPS, not an IP allowlist, unless your Tanium Cloud contact gives
you stable egress addresses.
