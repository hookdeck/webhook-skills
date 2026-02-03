---
name: webhook-handler-patterns
description: >
  Best practices for webhook handlers. Use when implementing idempotency,
  error handling, retry logic, or debugging framework-specific issues
  with Express, Next.js, or FastAPI.
license: MIT
metadata:
  author: hookdeck
  version: "0.1.0"
  repository: https://github.com/hookdeck/webhook-skills
---

# Webhook Handler Patterns

## When to Use This Skill

- Implementing idempotent webhook handlers
- Handling errors and configuring retry behavior
- Understanding framework-specific gotchas (raw body, middleware order)
- Building production-ready webhook infrastructure

## Resources

### Best Practices

- [references/idempotency.md](references/idempotency.md) - Prevent duplicate processing
- [references/error-handling.md](references/error-handling.md) - Return codes, logging, dead letter queues
- [references/retry-logic.md](references/retry-logic.md) - Provider retry schedules, backoff patterns

### Framework Guides

- [references/frameworks/express.md](references/frameworks/express.md) - Express.js patterns and gotchas
- [references/frameworks/nextjs.md](references/frameworks/nextjs.md) - Next.js App Router patterns
- [references/frameworks/fastapi.md](references/frameworks/fastapi.md) - FastAPI/Python patterns

## Quick Reference

### Response Codes

| Code | Meaning | Provider Behavior |
|------|---------|-------------------|
| `2xx` | Success | No retry |
| `4xx` | Client error | Usually no retry (except 429) |
| `5xx` | Server error | Retry with backoff |
| `429` | Rate limited | Retry after delay |

### Idempotency Checklist

1. Extract unique event ID from payload
2. Check if event was already processed
3. Process event within transaction
4. Store event ID after successful processing
5. Return success for duplicate events

## Related Skills

- [stripe-webhooks](../stripe-webhooks/) - Stripe payment webhook handling
- [shopify-webhooks](../shopify-webhooks/) - Shopify e-commerce webhook handling
- [github-webhooks](../github-webhooks/) - GitHub repository webhook handling
- [resend-webhooks](../resend-webhooks/) - Resend email webhook handling
- [hookdeck-event-gateway](../hookdeck-event-gateway/) - Production webhook infrastructure (routing, replay, monitoring)
