# BFCM Setup as Terraform

Use Terraform for the **standing** setup: standby source, recovery lane, provider registration and alerting. Use the CLI and API for **incident actions** (pause, rate changes, bulk replay and retry). Those are one-off operations, not resources, and running them through `terraform apply` mid-incident is slow and risky.

Provider: [`hookdeck/hookdeck`](https://registry.terraform.io/providers/hookdeck/hookdeck/latest/docs) v3. Resources are named `hookdeck_gateway_*`; the older `hookdeck_source` / `hookdeck_destination` / `hookdeck_connection` names are deprecated.

## Standby source plus pre-provisioned recovery lane

```hcl
terraform {
  required_providers {
    hookdeck = {
      source  = "hookdeck/hookdeck"
      version = "~> 3.0"
    }
  }
}

provider "hookdeck" {} # reads HOOKDECK_API_KEY

variable "orders_webhook_url" { type = string }
variable "recovery_rate"      { type = number } # per second, from your load test headroom

variable "shopify_app_client_secret" {
  type      = string
  sensitive = true
}

variable "recovery_source_api_key" {
  type      = string
  sensitive = true # any long random value; nothing ever sends it
}

# Standby: registered at the provider, deliberately has NO connection.
# Verified webhooks are stored as NO_CONNECTION requests and acknowledged with 200;
# forged ones are stored as VERIFICATION_FAILED and never replayed.
resource "hookdeck_gateway_source" "shopify_standby" {
  name = "shopify-standby"
  type = "SHOPIFY"
}

resource "hookdeck_gateway_source_auth" "shopify_standby" {
  source_id = hookdeck_gateway_source.shopify_standby.id
  auth = jsonencode({
    webhook_secret_key = var.shopify_app_client_secret
  })
}

# Recovery lane: idle until an incident replays the standby's capture into it.
# Its connection delivers straight to production, so the source must reject
# anything sent to its URL. Replay skips source verification, so this auth
# never blocks a replay.
resource "hookdeck_gateway_source" "recovery" {
  name = "bfcm-recovery"
  type = "WEBHOOK"
}

resource "hookdeck_gateway_source_auth" "recovery" {
  source_id = hookdeck_gateway_source.recovery.id
  auth_type = "API_KEY"
  auth = jsonencode({
    header_key = "x-api-key"
    api_key    = var.recovery_source_api_key
  })
}

resource "hookdeck_gateway_destination" "orders_recovery" {
  name = "orders-api-recovery" # separate from any live destination: independent rate limit
  type = "HTTP"
  config = jsonencode({
    url = var.orders_webhook_url
    delivery_policy = {
      rate   = var.recovery_rate
      period = "second"
    }
  })
}

resource "hookdeck_gateway_connection" "recovery" {
  name           = "bfcm-recovery"
  source_id      = hookdeck_gateway_source.recovery.id
  destination_id = hookdeck_gateway_destination.orders_recovery.id
  rules = [
    {
      retry_rule = {
        strategy              = "exponential"
        count                 = 10
        interval              = 60000
        response_status_codes = ["429", "500-599"]
      }
    }
  ]
}

output "standby_source_id"       { value = hookdeck_gateway_source.shopify_standby.id }
output "standby_source_url"      { value = hookdeck_gateway_source.shopify_standby.url }
output "recovery_connection_id"  { value = hookdeck_gateway_connection.recovery.id }
output "recovery_destination_id" { value = hookdeck_gateway_destination.orders_recovery.id }
```

Feed the outputs into the incident runbook as `STANDBY_SRC`, `RECOVERY_CONN` and `RECOVERY_DEST`.

The `auth` JSON keys depend on the source type (`webhook_secret_key` for HMAC providers like Shopify; `header_key` and `api_key` for API-key auth). Run `terraform plan` and the capture test in [prepare.md](prepare.md) to confirm the source verifies as expected.

## Registering the standby URL with the provider

`hookdeck_webhook_registration` makes an HTTP call to the provider's API on create (`register`) and on destroy (`unregister`). It works with any provider that has a webhook-subscription API. The provider's documented example is Stripe:

```hcl
variable "stripe_secret_key" {
  type      = string
  sensitive = true
}

resource "hookdeck_gateway_source" "stripe_standby" {
  name = "stripe-standby"
  type = "STRIPE"
}

resource "hookdeck_webhook_registration" "stripe_standby" {
  register = {
    request = {
      method = "POST"
      url    = "https://api.stripe.com/v1/webhook_endpoints"
      headers = jsonencode({
        "content-type" = "application/x-www-form-urlencoded"
        authorization  = "Bearer ${var.stripe_secret_key}"
      })
      body = "url=${hookdeck_gateway_source.stripe_standby.url}&enabled_events[]=payment_intent.succeeded&enabled_events[]=charge.refunded"
    }
  }
  unregister = {
    request = {
      method = "DELETE"
      url    = "https://api.stripe.com/v1/webhook_endpoints/{{.register.response.body.id}}"
      headers = jsonencode({
        authorization = "Bearer ${var.stripe_secret_key}"
      })
    }
  }
}
```

- Subscribe the standby to the **same** events, and pin the same `api_version` as your direct endpoint, so replayed payloads have the same shape. Stripe allows up to 16 endpoints per account ([provider-notes.md](provider-notes.md)).
- Stripe generates a separate signing secret (`whsec_...`) for this endpoint. Add it to the standby source with a `hookdeck_gateway_source_auth` resource (`webhook_secret_key`) once the endpoint exists, or the standby can't tell real Stripe events from forgeries.

## Inline setup

For an inline setup, the live connection's destination carries the sustained delivery rate from your load test:

```hcl
variable "sustained_rate" { type = number } # per second, from your load test

resource "hookdeck_gateway_destination" "orders" {
  name = "orders-api"
  type = "HTTP"
  config = jsonencode({
    url             = var.orders_webhook_url
    delivery_policy = { rate = var.sustained_rate, period = "second" }
  })
}
```

## Drift during an incident

- **Pause is not a Terraform argument.** `paused_at` is read-only on `hookdeck_gateway_connection`, so pausing or unpausing with the CLI does not create drift, and `terraform apply` won't undo it.
- **Delivery rate is.** It lives in the destination's `config.delivery_policy`. If the incident runbook changes it with `hookdeck gateway destination update --rate-limit`, the next `terraform apply` puts back the value in code. Either change the variable and apply, or record the CLI change and reconcile code after the incident.

## Alerting

The provider has no issue-trigger resource. Create the backpressure and delivery-failure triggers with the API calls in [prepare.md § 6](prepare.md#6-alert-on-the-right-signals). They are idempotent `PUT`s, so they can run from the same pipeline as `terraform apply`.
