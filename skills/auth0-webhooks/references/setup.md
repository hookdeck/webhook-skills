# Setting Up Auth0 Webhooks (Custom Log Stream)

## Prerequisites

- An Auth0 tenant with **Admin** access to the Dashboard.
- A publicly reachable **HTTPS** endpoint for your handler (e.g.
  `https://your-app.com/webhooks/auth0`). For local development use a tunnel
  (see [Local Development](#local-development)).

## Choose Your Authorization Token

Auth0 log streams are secured with a static shared secret sent in the
`Authorization` header — there is no signing secret to fetch. **You** generate
this token and configure both sides with the same value.

Generate a long, random value:

```bash
openssl rand -hex 32
```

Store it in your app as `AUTH0_LOG_STREAM_TOKEN`.

## Create the Log Stream

1. Go to **Auth0 Dashboard → Monitoring → Streams**.
2. Click **Create Stream** and choose **Custom Webhook** (HTTP).
3. Give the stream a name (e.g. `My App Webhook`).
4. Configure the delivery settings:
   - **Payload URL** — your endpoint, e.g. `https://your-app.com/webhooks/auth0`
   - **Content Type** — `application/json`
   - **Content Format** — select **JSON Array**. Auth0 offers JSON lines,
     arrays, or objects; JSON Array sends a single JSON array of log records,
     which the examples in this skill parse. **JSON Lines** sends
     newline-delimited JSON objects, which a standard JSON body parser rejects.
     Auth0's docs don't spell out the JSON Object body; the examples treat a
     non-array body as a single record.
   - **Authorization Token** — paste the value of your `AUTH0_LOG_STREAM_TOKEN`.
     Auth0 sends this **verbatim** as the `Authorization` request header.
5. Click **Save**.

> **Tip:** If you want a `Bearer`-style header, set the Authorization Token to
> `Bearer <your-secret>` and compare against that exact string in your handler.
> Whatever you type is what Auth0 sends — match it exactly.

## Select Events

Custom log streams deliver **all tenant log events** by default. Filter to the
event types you care about (e.g. `s`, `f`, `ss`) in your handler by inspecting
`event.data.type`. Some Auth0 plans also support server-side event filtering on
the stream configuration.

## Verify Delivery

After saving, Auth0 begins streaming events. Trigger a login or signup in your
tenant and confirm your endpoint receives a `POST` with a JSON array body (with
the JSON Array content format) and a matching `Authorization` header. Auth0's stream **Health** view shows recent
delivery successes and failures.

## Retries

Auth0 **retries** delivery when your endpoint returns a non-`2xx` status or
times out. Return `2xx` as soon as you've authenticated and accepted the batch;
do heavy processing asynchronously. Repeated failures can pause the stream.

## Local Development

Use the Hookdeck CLI to receive events on your local machine — no account
required, no install (`npx` fetches it):

```bash
npx hookdeck-cli listen 3000 auth0 --path /webhooks/auth0
```

The CLI prints a public URL. Use that URL as the log stream's **Payload URL**
in the Auth0 Dashboard. Requests are tunneled to `http://localhost:3000/webhooks/auth0`
and shown in the Hookdeck web UI for inspection and replay.
