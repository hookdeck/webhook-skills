# Setting Up Coassemble Webhooks

## Prerequisites

- A Coassemble workspace on the Build plan or above
- A publicly reachable HTTPS endpoint (webhook URLs must use `https://`; use the Hookdeck CLI for local development)

## Register Your Endpoint

1. In Coassemble authoring, go to **Developer → Webhooks**.
2. Create a webhook endpoint with your URL and select one or more events, e.g. `course.completed`, `course.commenced`, `quiz.completed`.
3. Save it.

Endpoints can also be managed through the Webhooks API (list, create, delete), which suits integrations such as an LMS plugin that registers its own receiver during setup.

## Get Your Signing Secret

Each endpoint has its own signing secret, generated when the endpoint is created. **It is returned once, on creation**, so copy it immediately and set it as `COASSEMBLE_WEBHOOK_SECRET`.

## Test Your Endpoint

Send a test delivery from **Developer → Webhooks**. Test deliveries have `testMode: true` and `data.test: true`, are signed like real ones, and should get a `2xx`. Test events are also delivered in Sandbox, so route `testMode: true` events away from production actions.

## Local Development

```bash
npx hookdeck-cli listen 3000 coassemble --path /webhooks/coassemble
```

Use the Hookdeck URL as the endpoint URL in Coassemble, then send a test delivery.
