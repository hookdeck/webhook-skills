# Setting Up Docker Hub Webhooks

## Prerequisites

**Who is allowed to create a webhook:**

- **Personal repository:** the repository **owner only**. Verbatim: *"For a
  personal repository, only the repository owner can create webhooks.
  Collaborators can't create webhooks."*
- **Organization repository:** *"you must be an organization owner or editor, or
  a team member with admin permissions on the repository."*

**Creating one through the Docker Hub API** instead requires one of:

- A [personal access token](https://docs.docker.com/security/access-tokens/personal-access-tokens/) with **delete** permissions
- An [organization access token](https://docs.docker.com/security/access-tokens/organization-access-tokens/) with the **`scope-webhook-edit`** scope or higher

> The Docker Hub API reference does not document the webhook CRUD endpoints
> themselves. Don't guess paths for them — use the UI, or work from whatever the
> API reference actually publishes at the time you read it.

**You also need:** a publicly reachable HTTPS endpoint, and a long random token
to embed in its URL (see below).

## There Is No Signing Secret to Get

This is the step you would expect and it does not exist. **The create-webhook
form takes exactly two inputs: a name and a destination URL.** There is no field
for a secret, no field for a custom header, no Basic Auth credentials, and no
generated signing key anywhere in the Docker Hub UI or docs.

So before you create the webhook, generate the only secret in this system —
the one you put in the URL yourself:

```bash
openssl rand -hex 32
```

Put it in your app's environment as `DOCKER_HUB_WEBHOOK_TOKEN`, and build the
URL you are about to register from it:

```
https://your-app.example.com/webhooks/docker-hub/<that-token>
```

**Mind the length limit:** *"The URL must be 255 characters or fewer."* A
64-character hex token plus a typical host and path fits comfortably, but check
before you paste.

## Create a Webhook

From the docs, verbatim:

1. In your chosen repository, select the **Webhooks** tab.
2. Provide a name for the webhook.
3. Provide a destination webhook URL. This is where webhook POST requests are
   delivered. The URL must be 255 characters or fewer.
4. Select **Create**.

That's it. There is **no verification step, no challenge request, no test event
and no "ping"** to confirm the endpoint — Docker Hub starts POSTing on the next
push to that repository.

## Select Events to Receive

There is nothing to select. Docker Hub webhooks have **one trigger** — a push to
the repository — and no event filter, no event checkboxes, and no event type in
the payload. If you only care about certain tags or repositories, filter in your
handler (see `DOCKER_HUB_ALLOWED_REPOS` below and the `push_data.tag` check in
the examples).

## View Delivery History

From the docs, verbatim:

1. Hover over your webhook under the **Current Webhooks section**.
2. Select the **Menu options** icon.
3. Select **View History**.

> You can then view the delivery history, and whether delivering the POST
> request was successful or not.

This is the only delivery observability Docker Hub provides. **Retry policy and
timeout are not documented**, so do not assume a redelivery will happen — and do
not assume it won't. Make your handler idempotent (dedupe on `repo_name` + `tag`
+ `pushed_at`) either way.

## Test Mode vs Live Mode

There isn't one. Docker Hub has no test mode, no sandbox and no "send test
event" button for repository webhooks. To exercise your handler end to end you
must actually push a tag:

```bash
docker tag myimage:local myorg/myapp:webhook-test
docker push myorg/myapp:webhook-test
```

For iterating on the handler itself without touching the registry, replay the
documented payload against your local server with `curl` — each example's README
shows the exact command.

## Environment Variables

```bash
# REQUIRED. The random token you embedded in the registered webhook URL.
# NOT a Docker Hub signature — Docker Hub provides no secret of any kind.
# Unset => the handler fails closed with 500 rather than accepting anything.
DOCKER_HUB_WEBHOOK_TOKEN=

# OPTIONAL. Comma-separated repository.repo_name allowlist. When set, a push for
# any repo not in the list is rejected with 403.
DOCKER_HUB_ALLOWED_REPOS=myorg/myapp,myorg/dhi-python

# OPTIONAL. Used only to re-confirm the pushed tag against the Docker Hub API
# before acting on it. A PAT/OAT is not itself a bearer token for the Hub API —
# it is the `secret` you exchange at POST /v2/auth/token (with your username or
# org as `identifier`) for a short-lived JWT. Public repositories need no auth.
DOCKER_HUB_API_IDENTIFIER=
DOCKER_HUB_API_TOKEN=
```

## Securing an Unsigned Endpoint

Because there is no signature, the endpoint's security is entirely your
responsibility. In rough order of value:

1. **Secret URL token**, compared in constant time, failing closed when the env
   var is unset. This is what the examples implement.
2. **Repository allowlist** — so someone who learns the URL still can't trigger
   a deploy for an arbitrary repo they control.
3. **Re-confirm against Docker Hub** before anything consequential — check the
   tag exists and its digest via `GetRepositoryTag`, and deploy by digest.
4. **Keep the URL out of logs.** It contains a bearer secret. Configure your
   reverse proxy / load balancer / APM not to log the full request path for this
   route, and rotate the token periodically.
5. **TLS only, plus normal edge hygiene** — rate limiting, a small body-size
   cap, a WAF if you have one.

Docker publishes **no source-IP allowlist** for webhook delivery, so there is no
IP-based control to apply. Don't invent one.

Full reasoning in [verification.md](verification.md).

## Rotating the Token

Because the token *is* the URL, rotation means re-registering:

1. Generate a new token and deploy it alongside the old one (accept either
   value for the rotation window).
2. Edit the webhook in the Docker Hub UI to the new URL.
3. Confirm a delivery lands on the new URL via **View History**.
4. Remove the old token from your app.

## Using Hookdeck

Hookdeck's source type for this provider is **`DOCKER_HUB`** (label "Docker
Hub", slug `docker-hub`), with method **POST**. Its verification setting is **"No
verification (schema only)"** — as Hookdeck's own code comment puts it, *"Docker
Hub repository webhooks are unsigned (no secret, signature or auth header)."*

What that means in practice:

- **Hookdeck does not verify a Docker Hub signature**, because none exists. Do
  not configure or expect one.
- **Docker Hub cannot send Basic auth or custom headers** to Hookdeck — those
  are not options in the create-webhook form, and are undocumented.
- **The Hookdeck source URL is itself unguessable**, which is the same class of
  protection as the secret URL token, applied at the gateway.
- **Hookdeck can sign the Hookdeck → your destination hop** with its own
  outbound signature. That secures the second hop only; it says nothing about
  whether the inbound request really came from Docker Hub.

Register the Hookdeck source URL as the destination in the Docker Hub Webhooks
tab, exactly as you would your own endpoint.

Docker Hub is not yet listed at hookdeck.com/docs/sources (checked 2026-09-28),
so there is no provider guide page for it there yet.

## Local Development

```bash
npx hookdeck-cli listen 3000 docker-hub --path /webhooks/docker-hub
```

Use `8000` instead of `3000` for the FastAPI example. Append your token segment
so the CLI forwards to the token route:

```bash
npx hookdeck-cli listen 3000 docker-hub --path /webhooks/docker-hub/$DOCKER_HUB_WEBHOOK_TOKEN
```

No account required — the CLI creates a guest account on first run and gives you
a public HTTPS URL plus a web UI for inspecting requests. Paste that HTTPS URL
into the Docker Hub Webhooks tab and push a tag.
