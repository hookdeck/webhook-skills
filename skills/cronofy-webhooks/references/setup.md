# Setting Up Cronofy Webhooks

## Prerequisites

- A Cronofy developer account in the **correct data centre** (see below)
- A Cronofy application (gives you a client ID and client secret)
- An OAuth access token for the account whose calendar you want notifications for
- A publicly reachable callback URL. Cronofy accepts HTTP or HTTPS but **strongly
  prefers HTTPS**, and it *verifies the certificate*: self-signed certs or partial
  trust chains block delivery entirely. Cronofy states an SSL Labs grade of **A** is
  required.

## Pick the Right Data Centre First

Cronofy runs six entirely separate instances. No personally identifiable information flows
between them, and **developer accounts must be created per data centre**. The APIs are
functionally identical; only the host differs.

| Data centre | API host |
|-------------|----------|
| United States | `https://api.cronofy.com` |
| United Kingdom | `https://api-uk.cronofy.com` |
| Germany | `https://api-de.cronofy.com` |
| Australia | `https://api-au.cronofy.com` |
| Canada | `https://api-ca.cronofy.com` |
| Singapore | `https://api-sg.cronofy.com` |

Cronofy docs write this as `{data_center_url}`. Channel creation **and** the follow-up
Read Events call after a `change` notification must both hit the data centre the account
belongs to. Hitting the wrong host is a common cause of "the channel was created but I
can't find the events."

## Get Your Signing Secret

**The HMAC key is your application's OAuth client secret.** There is no separate webhook
signing secret to generate.

1. Sign in to the Cronofy developer dashboard for your data centre.
2. Open your application's settings.
3. Copy the **Client Secret** — it is prefixed `CRN_`, e.g.
   `CRN_NggYusqPGLxwjw5FHOJYOqSrTPNXy8WQf14OID`.
4. Store it as `CRONOFY_CLIENT_SECRET`.

This is the same secret you use for the OAuth token exchange. It is **not** the client ID
and **not** an access token. Treat it as a high-value credential: it both mints tokens and
verifies webhooks.

### Secret rotation

Cronofy applications can have **two active client secrets at once** so you can rotate
without downtime. During rotation Cronofy signs each notification with *every* active
secret and sends all the digests in one comma-separated `Cronofy-HMAC-SHA256` header. Your
receiver only needs whichever secret it currently holds — as long as it checks membership
in the list rather than comparing the whole header string.

## Register Your Endpoint (Create a Notification Channel)

There is **no dashboard field for a global webhook URL.** Channels are created per account
over the API.

```bash
curl -X POST "https://api.cronofy.com/v1/channels" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "callback_url": "https://your-app.example.com/webhooks/cronofy"
  }'
```

Response:

```json
{
  "channel": {
    "channel_id": "chn_54cf7c7cb4ad4c1027000001",
    "callback_url": "https://your-app.example.com/webhooks/cronofy",
    "filters": {}
  }
}
```

`channel.filters` echoes only *non-default* filters, so it is empty here — the request set
none. The filtered example below shows it populated.

Immediately after creation Cronofy sends a `verification` notification to the callback URL
to check it works. Deploy your endpoint *before* creating the channel: creation itself
still returns `200` with a `channel_id` even if the callback is unreachable, so a broken
endpoint does not surface as a creation error — it surfaces 24 hours later when Cronofy
gives up and closes the channel.

Two behaviours worth knowing before you write channel-management code:

- **Creating an identical channel returns the existing one.** Per the docs, the returned
  `channel_id` "may be for an existing channel if you make a request to create a channel
  that is identical to an existing one." Re-running creation is therefore not automatically
  a duplicate — but it is not a documented general-purpose upsert either, so don't lean on
  it for changing a channel's filters.
- **The cap is 128 channels per connected account**, and Cronofy explicitly recommends
  using only one. If you create a channel per user session without closing the old ones,
  you will hit this.

Errors: `401` for unrecognised credentials (refresh the access token and retry) and `422`
for invalid parameters, whose body carries an `errors` object keyed by parameter name.

### Optional filters

| Parameter | Type | Effect |
|-----------|------|--------|
| `filters.calendar_ids` | Array of strings | Restricts notifications to changes to events within the specified calendars |
| `filters.only_managed` | Boolean | Only events you are managing for the account trigger notifications |

```bash
curl -X POST "https://api.cronofy.com/v1/channels" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "callback_url": "https://your-app.example.com/webhooks/cronofy",
    "filters": {
      "calendar_ids": ["cal_n23kjnwrw2_sakdnawerd3"],
      "only_managed": false
    }
  }'
```

Whatever non-default filters you set are echoed back in `channel.filters` on every
notification.

### Per-channel callback URLs

Because `callback_url` is a channel property, different accounts (or tenants, or
environments) can post to different URLs. Cronofy suggests embedding a token in the
callback URL itself — e.g.
`https://your-app.example.com/webhooks/cronofy/9f3c1a...` — as an **optional extra layer**
of defence in depth. It is *not* a signature and is not a substitute for HMAC
verification; treat it as a cheap pre-filter that lets you reject junk before spending a
hash.

## List and Close Channels

```bash
# List
curl "https://api.cronofy.com/v1/channels" \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Close
curl -X DELETE "https://api.cronofy.com/v1/channels/chn_54cf7c7cb4ad4c1027000001" \
  -H "Authorization: Bearer $ACCESS_TOKEN"
```

Close channels when a user disconnects, and re-create them if your endpoint was down long
enough for Cronofy to close them for you.

## Handling the `change` Follow-Up

`change` notifications carry `changes_since` but not the changed events. Fetch them:

```bash
curl -G "https://api.cronofy.com/v1/events" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  --data-urlencode "tzid=Etc/UTC" \
  --data-urlencode "last_modified=2026-08-26T09:24:16Z"
```

Use the **same data centre host** you created the channel on. Read Events is paginated —
follow `pages.next_page`.

## Test Mode vs Live Mode

Cronofy has no separate webhook test mode and no "send test event" button. The practical
ways to exercise your endpoint:

1. **Create a channel** pointing at your tunnel — the `verification` notification arrives
   right away, which proves connectivity and signature verification end to end.
2. **Change an event** in a connected calendar (create, move, or delete a meeting) to
   trigger a `change`.
3. **Replay** a captured delivery from the Hookdeck CLI web UI. Since the signature covers
   only the body, a replayed request verifies exactly like the original — useful for
   testing, and a reminder that Cronofy has no replay protection.

Remember: Cronofy does **not** notify you about changes your own API calls caused, so
creating an event through the Cronofy API will not produce a `change` for your channel.

## Local Development

```bash
npx hookdeck-cli listen 3000 cronofy --path /webhooks/cronofy
```

No account required — the CLI creates a guest account on first run and gives you a public
HTTPS URL plus a web UI for inspecting requests. Use the printed URL as your channel's
`callback_url`.

Because Cronofy closes a channel after 24 hours of failed deliveries, tunnels that go
stale overnight are a real hazard in development. If notifications stop arriving, list
your channels before debugging anything else — the channel may simply be gone.

## Official Documentation

- [Push Notifications](https://docs.cronofy.com/api-reference/calendar-control/push-notifications/)
- [Create Notification Channel](https://docs.cronofy.com/api-reference/calendar-control/push-notifications/create-channel/)
- [Authentication of push notifications](https://docs.cronofy.com/api-reference/authorization/webhook-authentication/)
- [Data centres](https://docs.cronofy.com/developers/temporal-grid/data-centers/)
