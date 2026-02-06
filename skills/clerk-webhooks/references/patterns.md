# Clerk Webhook Patterns and Pitfalls

> **Prerequisite**: Webhooks are asynchronous. Use for background tasks (sync, notifications), not synchronous flows.

## Official Documentation

| Task | Link |
|------|------|
| Overview | https://clerk.com/docs/guides/development/webhooks/overview |
| Sync to database | https://clerk.com/docs/guides/development/webhooks/syncing |
| Debugging | https://clerk.com/docs/guides/development/webhooks/debugging |
| Event catalog | https://dashboard.clerk.com/~/webhooks (Event Catalog tab) |

## Quick Start (Next.js)

1. Create endpoint at `app/api/webhooks/clerk/route.ts` (or `app/webhooks/clerk/route.ts`)
2. Use `verifyWebhook(req)` from `@clerk/backend/webhooks` (Next.js), or the `standardwebhooks` package (Express) — see [verification.md](verification.md)
3. Dashboard → Webhooks → Add Endpoint
4. Set `CLERK_WEBHOOK_SIGNING_SECRET` in env (or `CLERK_WEBHOOK_SECRET`)
5. Make route public (ensure `clerkMiddleware()` does not protect your webhook path)

For Express and FastAPI, see [SKILL.md](../SKILL.md) Essential Code and the [examples/](../examples/) directory.

## When to Sync

**Do sync when:**

- Need other users' data (social features, profiles)
- Storing extra custom fields (birthday, country, bio)
- Building notifications or integrations

**Don't sync when:**

- Only need current user data (use session token)
- No custom fields (Clerk has everything)
- Need immediate access (webhooks are eventual consistency)

## Key Patterns

### Make Route Public

Webhooks are sent unsigned by Clerk; your route must be public. Ensure `clerkMiddleware()` (or similar) does not protect `/api/webhooks/*` or `/webhooks/clerk`.

### Verify Webhook

- **Next.js**: Use `verifyWebhook(req)` from `@clerk/backend/webhooks` and pass the request directly.
- **Express**: Use the `standardwebhooks` npm package (Clerk uses Standard Webhooks; map `svix-*` headers to `webhook-*` when calling `wh.verify()`). See [verification.md](verification.md).
- **FastAPI**: Use manual verification (see [verification.md](verification.md)) or a Standard Webhooks library; you need the raw body.

### Type-Safe Events

Narrow to a specific event so TypeScript knows the payload shape:

```typescript
if (evt.type === 'user.created') {
  // evt.data is typed for user.created
}
```

### Handle All Three User Events

Don't only listen to `user.created`. Also handle `user.updated` and `user.deleted` so updates and deletions are reflected in your database.

### Queue Async Work

Return 200 quickly; queue long operations:

```typescript
await queue.enqueue('process-webhook', evt);
return new Response('Received', { status: 200 });
```

## Webhook Reliability

**Retries**: Svix retries failed webhooks for up to 3 days. Return 2xx to acknowledge success; 4xx/5xx triggers a retry.

**Replay**: Failed webhooks can be replayed from the Clerk Dashboard.

## Common Pitfalls

| Symptom | Cause | Fix |
|---------|-------|-----|
| Verification fails | Wrong import or usage | Use `@clerk/nextjs/webhooks` and pass `req` directly (Next.js), or use raw body + manual verification |
| Route not found (404) | Wrong path | Use `/api/webhooks/clerk` or `/webhooks/clerk` consistently |
| Not authorized (401) | Route is protected | Make webhook route public (exclude from auth middleware) |
| No data in DB | Async job pending | Wait or check logs; ensure you return 200 before heavy work |
| Duplicate entries | Only handling `user.created` | Also handle `user.updated` and `user.deleted` |
| Timeouts | Handler too slow | Return 200 immediately and queue async work |
