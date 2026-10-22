# VGS Webhooks Overview

## What Are VGS Webhooks?

VGS (Very Good Security) is a data tokenization platform. Its webhook notifications tell your server when something happens in your VGS organization, such as a live route being changed, a vault being created, a user logging in, or the proxy hitting upstream errors. Each notification is an HTTPS POST with a JSON body and a `vgs-signature` header. For every webhook integration VGS generates a unique secret used to verify requests.

Payment-related events (for example Account Updater and network tokens) are documented separately in the VGS Credential Management docs and are not covered here.

## Common Event Types

| Event | Scope | Triggered When | Details fields |
|-------|-------|----------------|----------------|
| `route.created` | Vault | A route is created | `route_id`, `route_name`, `environment` |
| `route.updated` | Vault | A route is changed | `route_id`, `route_name`, `environment` |
| `route.delete` | Vault | A route is deleted | `route_id`, `route_name`, `environment` |
| `vault.created` | Organization | A vault is created | `vault_id`, `vault_name`, `environment` |
| `user.permissions_updated` | User | A user's permissions change | `user_email`, `org_id`, permissions list |
| `user.permissions_deleted` | User | A user's permissions are removed | `user_email`, `org_id`, permissions list |
| `user.logged_in` | User | A user logs in | `user_ip`, `user_email` |
| `user.password_updated` | User | A user updates their password | `user_ip`, `user_email` |
| `user.mfa_created` | User | A user adds MFA | `user_ip`, `user_email` |
| `user.mfa_deleted` | User | A user removes MFA | `user_ip`, `user_email` |
| `proxy.upstream_error` | Vault | The proxy hits an upstream error | `upstream_host`, `upstream_error`, `environment` |
| `alias.reveal_failed` | Vault | Revealing an alias fails | `environment`, `storage` |

## Event Payload Structure

The event type is the top-level `event` field of the JSON body. Payloads commonly include `description`, `details`, `event`, `id`, `integration_id`, `occurrence`, `org_id`, `producer`, `scope`, `summary`, `tenant`, and `timestamp`. The fields inside `details` vary by event (see the table above).

## Delivery, Retries and Grouping

- VGS attempts delivery 8 times: immediately, then after 5 seconds, 5 minutes, 30 minutes, 2 hours, 5 hours, 10 hours, and 10 hours more. Respond with `200` to stop retries; any non-200 response counts as a failure.
- Retries are sent with the **same** `vgs-signature` timestamp as the first attempt.
- Notifications generated while an endpoint is disabled are not retried.
- Frequent events (`proxy.upstream_error`, `alias.reveal_failed`) are grouped: only the 1st, 10th, 100th, 1000th, and so on are sent per 5-minute window. `occurrence` holds the count.
- VGS can also replay a time range on request through support.

## Source IPs

Notifications arrive from `44.228.126.217`, `50.112.21.217`, `52.24.126.164`, `54.148.139.208`, `2600:1f24:64:8000::/52`, `54.164.207.221`, `54.90.7.123`, and `2600:1f28:37:4000::/52`. An IP allowlist is optional; the signature is the primary check.

## Full Event Reference

For the complete list, see [VGS webhook notifications](https://docs.verygoodsecurity.com/enterprise-platform/developer-resources/webhook-notifications).
