# Webhook Skills

This repository contains webhook-related skills for AI coding agents that need to **receive, verify signatures, handle events, retry deliveries, or debug webhook integrations** from various providers ([see Provider Webhook Skills table below](#provider-webhook-skills)).

Skills provide step-by-step instructions, signature verification code, and runnable examples for Express, Next.js, and FastAPI.

Works with [Claude Code](https://claude.ai/code), [Cursor](https://cursor.com), [VS Code Copilot](https://github.com/features/copilot), and other AI coding assistants that support the [Agent Skills specification](https://agentskills.io).

## When Should an Agent Use These Skills?

Use these webhook skills when:

- You need to **receive webhooks** from third-party providers (Stripe, Shopify, GitHub, etc.)
- You need to **verify webhook signatures** to ensure authenticity
- You need to **handle webhook event payloads** and extract data
- You need to **implement idempotency** for webhook handlers
- You need to **retry or replay** failed webhook deliveries
- You need **provider-specific webhook handling logic** (e.g., Stripe checkout events, GitHub push events)

## Skill Discovery

These skills are designed to be discoverable by agents using skill registries and tools like `find-skills`, where an agent searches for webhook-related capabilities by provider or task.

## Available Webhook Skills

### Provider Webhook Skills

Skills for receiving and verifying webhooks from specific providers. Each includes setup guides, webhook signature verification, and runnable examples.

| Provider | Skill | What It Does |
|----------|-------|--------------|
| [Adyen](https://docs.adyen.com/development-resources/webhooks/) | [`adyen-webhooks`](skills/adyen-webhooks/) | Verify Adyen webhook HMAC signatures (`additionalData.hmacSignature`), handle AUTHORISATION, CAPTURE, and REFUND notifications |
| [Akeneo](https://api.akeneo.com/events-documentation/overview.html) | [`akeneo-webhooks`](skills/akeneo-webhooks/) | Verify Akeneo PIM Events API webhook signatures (`x-akeneo-request-signature`, HMAC-SHA256 hex over `timestamp.body`), handle batched product and product-model events like product.created, product.updated, product.removed, product_model.created, product_model.updated, and product_model.removed |
| [Ashby](https://developers.ashbyhq.com/docs/setting-up-webhooks) | [`ashby-webhooks`](skills/ashby-webhooks/) | Verify Ashby webhook signatures (`Ashby-Signature`, HMAC-SHA256 hex over the raw body), handle recruiting events like applicationSubmit, candidateHire, candidateStageChange, and interviewScheduleCreate |
| [Alipay](https://docs.antom.com/ac/cashierpay/notifications) | [`alipay-webhooks`](skills/alipay-webhooks/) | Verify Alipay (Antom / Alipay+) webhook signatures (`Signature` header, RSA256 / SHA256withRSA, base64URL over `<METHOD> <URI>\n<Client-Id>.<Request-Time>.<body>`), sign the acknowledgement response, handle notifyPayment, notifyCapture, notifyRefund, notifyAuthorization, and notifyDispute events |
| [Alchemy](https://www.alchemy.com/docs/reference/webhooks-overview) | [`alchemy-webhooks`](skills/alchemy-webhooks/) | Verify Alchemy Notify webhook signatures (`X-Alchemy-Signature`, HMAC-SHA256 hex over the raw body), handle ADDRESS_ACTIVITY, MINED_TRANSACTION, DROPPED_TRANSACTION, NFT_ACTIVITY, NFT_METADATA_UPDATE, and GRAPHQL events |
| [Asana](https://developers.asana.com/docs/webhooks-guide) | [`asana-webhooks`](skills/asana-webhooks/) | Complete the Asana X-Hook-Secret handshake, verify X-Hook-Signature (HMAC-SHA256), handle batched compact events and heartbeats |
| [Ascend](https://developers.useascend.com/docs/webhooks) | [`ascend-webhooks`](skills/ascend-webhooks/) | Verify Ascend insurance-payment webhook signatures (`X-Ascend-Signature`, HMAC-SHA256 hex over `<timestamp>:<raw_body>`), handle invoice.paid, invoice.voided, payout.paid, and refund.paid events |
| [Airtable](https://airtable.com/developers/web/api/webhooks-overview) | [`airtable-webhooks`](skills/airtable-webhooks/) | Verify Airtable webhook pings (`X-Airtable-Content-MAC`, HMAC-SHA256), fetch payloads with a cursor, manage 7-day webhook expiry |
| [Airwallex](https://www.airwallex.com/docs/developer-tools/webhooks/webhooks-overview) | [`airwallex-webhooks`](skills/airwallex-webhooks/) | Verify Airwallex webhook signatures (`x-signature` / `x-timestamp`, HMAC-SHA256 hex over timestamp + raw body), handle payment_intent, payment_attempt, refund, payment_consent, and payment_dispute events |
| [AiPrise](https://docs.aiprise.com/docs/callbacks-authentication) | [`aiprise-webhooks`](skills/aiprise-webhooks/) | Verify AiPrise identity/KYC/KYB callback signatures (`X-HMAC-SIGNATURE`, HMAC-SHA256 hex keyed with your API private key), handle APPROVED, DECLINED, REVIEW, and UNKNOWN verification results |
| [Attentive](https://docs.attentive.com/docs/create-and-manage-webhooks) | [`attentive-webhooks`](skills/attentive-webhooks/) | Verify Attentive webhook signatures (`x-attentive-hmac-sha256`, HMAC-SHA256 hex), handle SMS and email subscriber events |
| [Auth0](https://auth0.com/docs/customize/log-streams/custom-log-streams) | [`auth0-webhooks`](skills/auth0-webhooks/) | Authenticate Auth0 Custom Log Stream deliveries (Authorization token), handle batched login and signup log events |
| [AWS SNS](https://docs.aws.amazon.com/sns/latest/dg/SendMessageToHttp.prepare.html) | [`aws-sns-webhooks`](skills/aws-sns-webhooks/) | Verify AWS SNS message signatures (RSA with SigningCertURL), confirm subscriptions, handle Notification envelopes |
| [BigCommerce](https://docs.bigcommerce.com/developer/docs/integrations/webhooks/overview) | [`bigcommerce-webhooks`](skills/bigcommerce-webhooks/) | Verify BigCommerce webhook callbacks (Standard Webhooks or custom headers), handle store/order and product events with API fetch-back |
| [Bitbucket](https://support.atlassian.com/bitbucket-cloud/docs/manage-webhooks/) | [`bitbucket-webhooks`](skills/bitbucket-webhooks/) | Verify Bitbucket webhook signatures (`X-Hub-Signature`, HMAC-SHA256), handle repo push and pull request events |
| [Bridge](https://apidocs.bridge.xyz/get-started/introduction/quick-start/setting-up-webhooks) | [`bridge-xyz-webhooks`](skills/bridge-xyz-webhooks/) | Verify Bridge (bridge.xyz) webhook signatures (`X-Webhook-Signature`, RSA-SHA256 with a per-endpoint public key), handle customer, kyc_link, transfer, and virtual_account events |
| [Bunny Stream](https://docs.bunny.net/stream/webhooks) | [`bunny-stream-webhooks`](skills/bunny-stream-webhooks/) | Verify Bunny Stream webhook signatures (`X-BunnyStream-Signature`, HMAC-SHA256 hex over the raw body, keyed on the library Read-Only API key), handle video encoding events by numeric `Status` (3 Finished, 5 Failed, 9 CaptionsGenerated, 10 TitleOrDescriptionGenerated) |
| [Bridge API](https://docs.bridgeapi.io/docs/webhooks) | [`bridge-api-webhooks`](skills/bridge-api-webhooks/) | Verify Bridge API (bridgeapi.io, open-banking by Bridge/Bankin') webhook signatures (`BridgeApi-Signature`, HMAC-SHA256 hex with `v1=` scheme), handle item, item.account, payment.transaction, and user.deleted events |
| [Calendly](https://developer.calendly.com/api-docs/ZG9jOjQ2NDA2NA-webhook-signatures) | [`calendly-webhooks`](skills/calendly-webhooks/) | Verify Calendly webhook signatures (`Calendly-Webhook-Signature`, HMAC-SHA256 with timestamp), handle invitee.created and invitee.canceled events |
| [Chargebee](https://www.chargebee.com/docs/2.0/events_and_webhooks.html) | [`chargebee-webhooks`](skills/chargebee-webhooks/) | Receive and verify Chargebee webhooks (Basic Auth), handle subscription billing events |
| [Circle](https://developers.circle.com/cpn/guides/webhooks/setup-webhook-notifications) | [`circle-webhooks`](skills/circle-webhooks/) | Verify Circle CPN/Mint webhook signatures (`X-Circle-Signature`, ECDSA_SHA_256), handle payments, paymentIntents, transfers, and payouts notifications |
| [Claude Managed Agents](https://platform.claude.com/docs/en/managed-agents/webhooks) | [`claude-managed-agents-webhooks`](skills/claude-managed-agents-webhooks/) | Verify Anthropic Claude Managed Agents webhook signatures (`X-Webhook-Signature`), handle session lifecycle and outcome evaluation events |
| [Clerk](https://clerk.com/docs/integrations/webhooks/overview) | [`clerk-webhooks`](skills/clerk-webhooks/) | Verify Clerk webhook signatures, handle user, session, and organization events |
| [Clio](https://docs.developers.clio.com/api-reference/#tag/Webhooks) | [`clio-webhooks`](skills/clio-webhooks/) | Complete the Clio `X-Hook-Secret` handshake and verify `X-Hook-Signature` (HMAC-SHA256 hex), handle matter, contact, activity, and bill events |
| [Cloudinary](https://cloudinary.com/documentation/notifications) | [`cloudinary-webhooks`](skills/cloudinary-webhooks/) | Verify Cloudinary notifications via the `x-cld-signature` / `x-cld-timestamp` headers (hex digest of raw body + timestamp + account API Secret, sha1 default or sha256) using the official SDK, handle `upload`, `eager`, `delete`, `rename`, `moderation`, and `resource_tags_changed` events |
| [CloudSignal (Cloudprinter.com)](https://docs.cloudprinter.com/client/cloudsignal-webhooks-v2-0) | [`cloudsignal-webhooks`](skills/cloudsignal-webhooks/) | Authenticate CloudSignal (Cloudprinter.com) print-fulfilment webhooks via the plaintext per-endpoint Webhook API key in the JSON body's `apikey` field (no HMAC/signature header, timing-safe compared), handle `CloudprinterOrderValidated`, `ItemValidated`, `ItemProduce`, `ItemProduced`, `ItemPacked`, `ItemShipped`, `ItemError`, `ItemCanceled`, and `CloudprinterOrderCanceled` signals |
| [Coinbase Commerce](https://docs.cdp.coinbase.com/commerce-onchain/docs/webhooks) | [`coinbase-commerce-webhooks`](skills/coinbase-commerce-webhooks/) | Verify Coinbase Commerce webhook signatures (`X-CC-Webhook-Signature`, HMAC-SHA256), handle charge lifecycle events |
| [Commerce Layer](https://docs.commercelayer.io/core/real-time-webhooks) | [`commercelayer-webhooks`](skills/commercelayer-webhooks/) | Verify Commerce Layer webhook signatures (`X-CommerceLayer-Signature`, HMAC-SHA256 base64), handle orders.place, orders.pay, and shipments.ship events |
| [Courier](https://www.courier.com/docs/platform/workspaces/outbound-webhooks) | [`courier-webhooks`](skills/courier-webhooks/) | Verify Courier outbound webhook signatures (`courier-signature`, HMAC-SHA256 with timestamp), handle message:updated, notification:submitted, and audiences events |
| [Cursor](https://docs.cursor.com/account/cloud-agent-webhooks) | [`cursor-webhooks`](skills/cursor-webhooks/) | Verify Cursor Cloud Agent webhook signatures, handle agent status events |
| [Customer.io](https://docs.customer.io/integrations/data-out/connections/webhooks/) | [`customerio-webhooks`](skills/customerio-webhooks/) | Verify Customer.io reporting webhook signatures (`X-CIO-Signature`, v0 HMAC-SHA256 with timestamp), handle object_type + metric events |
| [Deepgram](https://developers.deepgram.com/reference) | [`deepgram-webhooks`](skills/deepgram-webhooks/) | Receive and verify Deepgram transcription callbacks |
| [Discord](https://docs.discord.com/developers/events/webhook-events) | [`discord-webhooks`](skills/discord-webhooks/) | Verify Discord webhook event signatures (Ed25519), handle application and entitlement events |
| [eBay](https://developer.ebay.com/api-docs/commerce/notification/overview.html) | [`ebay-webhooks`](skills/ebay-webhooks/) | Complete the eBay endpoint challenge, verify the `x-ebay-signature` (ECDSA via `getPublicKey`), handle MARKETPLACE_ACCOUNT_DELETION notifications |
| [DocuSign](https://developers.docusign.com/platform/webhooks/connect/) | [`docusign-webhooks`](skills/docusign-webhooks/) | Verify DocuSign Connect signatures (`X-DocuSign-Signature-N`, HMAC-SHA256 base64), handle envelope and recipient events |
| [ElevenLabs](https://elevenlabs.io/docs/overview/administration/webhooks) | [`elevenlabs-webhooks`](skills/elevenlabs-webhooks/) | Verify ElevenLabs webhook signatures, handle call transcription events |
| [Enode](https://developers.enode.com/docs/webhooks) | [`enode-webhooks`](skills/enode-webhooks/) | Verify Enode webhook signatures (`x-enode-signature`, HMAC-SHA1 hex over the raw body), handle EV and energy events like `user:vehicle:updated`, `user:charger:updated`, and `user:battery:updated` |
| [Ethoca](https://developer.mastercard.com/ethoca-alerts-for-merchants/documentation/api-reference/push-api-ref/) | [`ethoca-webhooks`](skills/ethoca-webhooks/) | Receive Ethoca (Mastercard) Alerts Push API webhooks — no HMAC signature; authenticity is mutual TLS (MSSL, Entrust CA) plus HTTP Basic Auth — dispatch fraud and dispute alerts on `alertType` |
| [Exact Online](https://support.exactonline.com/community/s/article/All-All-DNO-Content-webhooksc?language=en_GB) | [`exact-online-webhooks`](skills/exact-online-webhooks/) | Verify Exact Online `HashCode` body signatures (HMAC-SHA256 over the `Content` node, hex, uppercased), subscribe to topics, handle `Accounts`, `Items`, `StockPositions`, `GoodsDeliveries` events |
| [Favro](https://favro.com/developer/) | [`favro-webhooks`](skills/favro-webhooks/) | Verify Favro `X-Favro-Webhook` signatures (base64 HMAC-SHA1 over `payloadId` + the registered URL, NOT the body), accept the setup ping, handle `card.created`, `card.committed`, `card.moved`, `card.updated`, `card.deleted`, and `comment.*` events |
| [Front](https://dev.frontapp.com/docs/webhooks-1) | [`frontapp-webhooks`](skills/frontapp-webhooks/) | Verify Front application webhook signatures (`X-Front-Signature`, HMAC-SHA256 over timestamp + body), complete the `X-Front-Challenge` handshake, handle inbound, outbound, move, assign, and tag events |
| [Fireblocks](https://developers.fireblocks.com/reference/webhooks-v2) | [`fireblocks-webhooks`](skills/fireblocks-webhooks/) | Verify Fireblocks webhook v2 signatures (detached JWS RS512 via JWKS), handle transaction lifecycle events |
| [Facebook](https://developers.facebook.com/docs/graph-api/webhooks) | [`facebook-webhooks`](skills/facebook-webhooks/) | Verify Facebook Graph API webhook signatures (`X-Hub-Signature-256`, HMAC-SHA256), complete the hub.challenge handshake, handle Page and User field updates |
| [Flexport](https://apidocs.flexport.com/v2/tag/Webhook-Endpoints/) | [`flexport-webhooks`](skills/flexport-webhooks/) | Verify Flexport webhook signatures (`X-Hub-Signature-256`, HMAC-SHA256), handle freight milestone events like `/shipment#created` and `/shipment_leg#departed` |
| [Fireflies](https://docs.fireflies.ai/graphql-api/webhooks-v2) | [`fireflies-webhooks`](skills/fireflies-webhooks/) | Verify Fireflies.ai Webhooks V2 signatures (`X-Hub-Signature`, `sha256=` + HMAC-SHA256 hex over the raw body), handle `meeting.transcribed` / `meeting.summarized` / `meeting.bot_joined`; legacy V1 documented |
| [FastSpring](https://developer.fastspring.com/reference/webhooks-overview) | [`fastspring-webhooks`](skills/fastspring-webhooks/) | Verify FastSpring webhook signatures (`X-FS-Signature`, HMAC-SHA256 base64 over the raw body), iterate the batched `events` array, handle order.completed, subscription.activated, subscription.charge.completed, and subscription.canceled events |
| [Faundit](https://faundit.gitbook.io/faundit-api-v2/webhooks) | [`faundit-webhooks`](skills/faundit-webhooks/) | Verify Faundit lost-and-found / returns webhook signatures (`X-Faundit-Signature-Next`, HMAC-SHA256 hex over `v1:<timestamp>:<body>` with the `X-Faundit-Timestamp` header; deprecated v0 `X-Faundit-Signature` signs `v0:<timestamp>` only), handle the `item-status` and `request-status` events whose granular status (delivered, finished, expired, registered, resolved, …) is the `data.status` field |
| [FusionAuth](https://fusionauth.io/docs/extend/events-and-webhooks/) | [`fusionauth-webhooks`](skills/fusionauth-webhooks/) | Verify FusionAuth JWT webhook signatures, handle user, login, and registration events |
| [GitHub](https://docs.github.com/en/webhooks) | [`github-webhooks`](skills/github-webhooks/) | Verify GitHub webhook signatures, handle push, pull_request, and issue events |
| [GitLab](https://docs.gitlab.com/ee/user/project/integrations/webhooks.html) | [`gitlab-webhooks`](skills/gitlab-webhooks/) | Verify GitLab webhook tokens, handle push, merge_request, issue, and pipeline events |
| [GoCardless](https://developer.gocardless.com/api-reference/#appendix-webhooks) | [`gocardless-webhooks`](skills/gocardless-webhooks/) | Verify GoCardless webhook signatures (`Webhook-Signature`, HMAC-SHA256), handle batched payment, mandate, and payout events |
| [Google Gemini](https://ai.google.dev/gemini-api/docs/webhooks) | [`gemini-webhooks`](skills/gemini-webhooks/) | Verify Gemini API webhook signatures (Standard Webhooks HMAC + JWKS modes), handle batch and long-running operation events |
| [Green Dot](https://developer.greendot.com/embedded-finance/docs/webhooks-overview) | [`greendot-webhooks`](skills/greendot-webhooks/) | Authenticate Green Dot Embedded Finance (BaaS) webhook deliveries via the OAuth client_credentials Bearer token (scope `post:webhook`), verify the optional `x-gd-signature` header, echo `x-GD-RequestId` and return the `responseDetails` acknowledgement, handle `transaction`, `accountUpdated`, `achTransfer`, `cardUpdate`, `billPayTransfer`, `directDepositSwitch`, and `provisioning` events |
| [HubSpot](https://developers.hubspot.com/docs/apps/legacy-apps/authentication/validating-requests) | [`hubspot-webhooks`](skills/hubspot-webhooks/) | Verify HubSpot v3 webhook signatures (HMAC-SHA256 with timestamp), handle contact, deal, and company events |
| [Hugging Face](https://huggingface.co/docs/hub/webhooks) | [`huggingface-webhooks`](skills/huggingface-webhooks/) | Authenticate Hugging Face webhooks (`X-Webhook-Secret`), handle repo, discussion, and comment events |
| [Intercom](https://developers.intercom.com/docs/webhooks) | [`intercom-webhooks`](skills/intercom-webhooks/) | Verify Intercom `X-Hub-Signature` (HMAC-SHA1), handle conversation, contact, and ticket events |
| [Jira](https://developer.atlassian.com/cloud/jira/platform/webhooks/) | [`jira-webhooks`](skills/jira-webhooks/) | Verify Jira webhook signatures (`X-Hub-Signature`, HMAC-SHA256), handle issue and comment events |
| [Klaviyo](https://developers.klaviyo.com/en/docs/webhooks) | [`klaviyo-webhooks`](skills/klaviyo-webhooks/) | Verify Klaviyo webhook signatures (HMAC-SHA256), handle flow-triggered webhook events |
| [Knock](https://docs.knock.app/developer-tools/outbound-webhooks/overview) | [`knock-webhooks`](skills/knock-webhooks/) | Verify Knock outbound webhook signatures (HMAC-SHA256 base64, **millisecond** timestamps), handle message lifecycle and resource change events |
| [Linear](https://linear.app/developers/webhooks) | [`linear-webhooks`](skills/linear-webhooks/) | Verify Linear webhook signatures (HMAC-SHA256), handle issue, comment, and project events |
| [Lithic](https://docs.lithic.com/docs/events-api) | [`lithic-webhooks`](skills/lithic-webhooks/) | Verify Lithic webhooks (Standard Webhooks / Svix, `webhook-signature` HMAC-SHA256) with the official SDK, handle card, transaction, payment, and dispute events |
| [LinkedIn](https://learn.microsoft.com/en-us/linkedin/shared/api-guide/developer-webhooks) | [`linkedin-webhooks`](skills/linkedin-webhooks/) | Verify LinkedIn webhook signatures (`X-LI-Signature`, HMAC-SHA256) and the challengeCode validation, handle Lead Sync and organization events |
| [Mailchimp](https://mailchimp.com/developer/marketing/guides/sync-audience-data-webhooks/) | [`mailchimp-webhooks`](skills/mailchimp-webhooks/) | Authenticate Mailchimp webhooks (URL secret + GET validation), handle subscribe, unsubscribe, and profile events |
| [Mailgun](https://documentation.mailgun.com/docs/mailgun/user-manual/webhooks/webhooks) | [`mailgun-webhooks`](skills/mailgun-webhooks/) | Verify Mailgun webhook signatures (HMAC-SHA256), handle email delivered, failed, opened, clicked, unsubscribed, and complained events |
| [Cisco Meraki](https://developer.cisco.com/meraki/webhooks/) | [`meraki-webhooks`](skills/meraki-webhooks/) | Verify Meraki Dashboard webhook alerts via the body `sharedSecret` (no HMAC header), handle motion_alert, settings_changed, sensor_alert, and stopped_reporting events |
| [Microsoft Graph](https://learn.microsoft.com/en-us/graph/webhooks) | [`microsoft-graph-webhooks`](skills/microsoft-graph-webhooks/) | Validate Microsoft Graph change notifications (validationToken handshake, clientState, rich-notification JWTs), manage subscription lifecycle |
| [Microsoft SharePoint](https://learn.microsoft.com/en-us/sharepoint/dev/apis/webhooks/overview-sharepoint-webhooks) | [`microsoft-sharepoint-webhooks`](skills/microsoft-sharepoint-webhooks/) | Answer the SharePoint `validationtoken` handshake, validate `clientState` (no HMAC), handle thin list notifications and resolve changes via GetChanges (ItemAdded, ItemUpdated, ItemDeleted) |
| [Mollie](https://docs.mollie.com/docs/webhooks) | [`mollie-webhooks`](skills/mollie-webhooks/) | Handle unsigned Mollie webhooks by fetching payment status from the API (fetch-to-confirm pattern) |
| [Neon](https://neon.com/docs/auth/guides/webhooks) | [`neon-webhooks`](skills/neon-webhooks/) | Verify Neon Auth webhook signatures (EdDSA / Ed25519 detached JWS via JWKS, `X-Neon-Signature`), handle user.created, user.before_create, send.otp, send.magic_link, and phone_number.verified events |
| [NMI](https://docs.nmi.com/reference/overview) | [`nmi-webhooks`](skills/nmi-webhooks/) | Verify NMI (Network Merchants) `Webhook-Signature` (`t=<nonce>,s=<sig>`, HMAC-SHA256 over `<nonce>.<raw_body>`, hex) where `t` is a nonce not a timestamp, handle `transaction.sale.success`, `transaction.auth.success`, `transaction.refund.success`, and `transaction.void.success` events |
| [monday.com](https://developer.monday.com/api-reference/reference/webhooks) | [`monday-webhooks`](skills/monday-webhooks/) | Verify monday.com webhook JWTs and the challenge handshake, handle item, column value, and update events |
| [Notion](https://developers.notion.com/reference/webhooks) | [`notion-webhooks`](skills/notion-webhooks/) | Verify Notion webhook signatures (HMAC-SHA256, `X-Notion-Signature`), complete handshake, handle page and comment events |
| [Nuvemshop](https://tiendanube.github.io/api-documentation/resources/webhook) | [`nuvemshop-webhooks`](skills/nuvemshop-webhooks/) | Verify Nuvemshop (Tiendanube) webhook signatures (HMAC-SHA256 hex over raw body, `x-linkedstore-hmac-sha256`), handle `order/created`, `order/paid`, `product/updated`, and `app/uninstalled` events |
| [Nylas](https://developer.nylas.com/docs/v3/notifications/webhooks/) | [`nylas-webhooks`](skills/nylas-webhooks/) | Verify Nylas v3 webhook signatures (`x-nylas-signature`, HMAC-SHA256), answer the challenge handshake, handle CloudEvents-format grant, message, and calendar events |
| [Okta](https://developer.okta.com/docs/concepts/event-hooks/) | [`okta-webhooks`](skills/okta-webhooks/) | Complete the Okta Event Hook verification challenge, authenticate deliveries, handle user lifecycle and session events |
| [OpenAI](https://platform.openai.com/docs/guides/webhooks) | [`openai-webhooks`](skills/openai-webhooks/) | Verify OpenAI webhooks for fine-tuning, batch, and realtime async events |
| [OpenClaw](https://docs.openclaw.ai/automation/webhook) | [`openclaw-webhooks`](skills/openclaw-webhooks/) | Verify OpenClaw Gateway webhook tokens, handle agent hook and wake event payloads |
| [Orb](https://docs.withorb.com/integrations-and-exports/webhooks) | [`orb-webhooks`](skills/orb-webhooks/) | Verify Orb webhook signatures (HMAC-SHA256 over `v1:{X-Orb-Timestamp}:{body}`), handle customer, subscription, and invoice events |
| [Oura](https://cloud.ouraring.com/v2/docs#tag/Webhook-Subscription-Routes) | [`oura-webhooks`](skills/oura-webhooks/) | Complete the Oura subscription handshake, verify `x-oura-signature` (HMAC-SHA256 over `timestamp + body`, UPPERCASE), handle sleep, daily_readiness, daily_activity, and workout events |
| [Paddle](https://developer.paddle.com/webhooks/overview) | [`paddle-webhooks`](skills/paddle-webhooks/) | Verify Paddle webhook signatures, handle subscription and billing events |
| [PayPal](https://developer.paypal.com/api/rest/webhooks/) | [`paypal-webhooks`](skills/paypal-webhooks/) | Verify PayPal webhook signatures (RSA-SHA256 with cert), handle payment, subscription, and order events |
| [PayPro Global](https://developers.payproglobal.com/docs/integrate-with-paypro-global/webhook-ipn/) | [`paypro-global-webhooks`](skills/paypro-global-webhooks/) | Verify PayPro Global IPN webhooks (form-encoded): `SIGNATURE` (SHA256 over `ORDER_ID`+`ORDER_STATUS`+`ORDER_TOTAL_AMOUNT`+`CUSTOMER_EMAIL`+`VALIDATION_KEY`+`TEST_MODE`+`IPN_TYPE_NAME`) and `HASH` (MD5 of `ORDER_ID`+`SecretKey`), handle `OrderCharged`, `OrderRefunded`, and `SubscriptionChargeSucceed` events |
| [Paymob](https://developers.paymob.com/paymob-docs/developers/webhook-callbacks-and-hmac) | [`paymob-webhooks`](skills/paymob-webhooks/) | Verify Paymob transaction callbacks (HMAC-SHA512 hex over 20 ordered fields, delivered as the `?hmac=` query param — not a header, not the raw body), read transaction state from `success`/`is_refunded`/`is_voided`/`is_capture` booleans |
| [Pipedrive](https://pipedrive.readme.io/docs/guide-for-webhooks-v2) | [`pipedrive-webhooks`](skills/pipedrive-webhooks/) | Authenticate Pipedrive webhooks (HTTP Basic Auth — no signature), handle `create.deal`, `change.person`, and `delete.activity` events |
| [Persona](https://docs.withpersona.com/webhooks) | [`persona-webhooks`](skills/persona-webhooks/) | Verify Persona webhook signatures (`Persona-Signature`, t=/v1= HMAC-SHA256 pairs), handle inquiry and verification events |
| [Paystack](https://paystack.com/docs/payments/webhooks/) | [`paystack-webhooks`](skills/paystack-webhooks/) | Verify Paystack webhook signatures (`x-paystack-signature`, HMAC-SHA512), handle charge, transfer, and subscription events |
| [Polar](https://polar.sh/docs/integrate/webhooks/endpoints) | [`polar-webhooks`](skills/polar-webhooks/) | Verify Polar webhook signatures (Standard Webhooks), handle order, subscription, and checkout events |
| [Picqer](https://picqer.com/en/api/webhooks) | [`picqer-webhooks`](skills/picqer-webhooks/) | Verify Picqer webhook signatures (`X-Picqer-Signature`, HMAC-SHA256 base64), handle order, picklist, and stock events |
| [Postmark](https://postmarkapp.com/developer/webhooks/webhooks-overview) | [`postmark-webhooks`](skills/postmark-webhooks/) | Authenticate Postmark webhooks (Basic Auth/Token), handle email delivery, bounce, open, click, and spam events |
| [Praxis](https://docs.praxis.tech/reference/webhooks) | [`praxis-webhooks`](skills/praxis-webhooks/) | Verify Praxis (Cashier) webhook signatures (`gt-authentication`, SHA-384 hex over ordered field values + Merchant Secret — not HMAC, not Standard Webhooks), sign the acknowledgement (`external-request-signature`), handle Payment Notification `transaction_status` (`pending`, `approved`, `rejected`, `error`) and Subscription Notification `event`s |
| [Pylon](https://getpylon.com/developers/guides/using-webhooks/) | [`pylon-webhooks`](skills/pylon-webhooks/) | Verify Pylon webhook signatures (`Pylon-Webhook-Signature`, `hs256=` HMAC-SHA256 over `timestamp.body`), handle B2B support issue events like `issue.created` and `issue.updated` |
| [Quoter](https://help.quoter.com/hc/en-us/articles/32085971955355-Integrate-with-Webhooks) | [`quoter-webhooks`](skills/quoter-webhooks/) | Verify Quoter webhooks (weak MD5 `hash` form field over `HASH_KEY + timestamp + data`, NOT HMAC and NOT Standard Webhooks — the hash key is optional), parse the `x-www-form-urlencoded` `hash`/`timestamp`/`data` payload, dispatch Quote, Person, and Payment create/update deliveries by `?object=` |
| [Razorpay](https://razorpay.com/docs/webhooks/) | [`razorpay-webhooks`](skills/razorpay-webhooks/) | Verify Razorpay webhook signatures (`X-Razorpay-Signature`, HMAC-SHA256), handle payment and order events |
| [Recharge](https://docs.getrecharge.com/docs/webhooks-overview) | [`recharge-webhooks`](skills/recharge-webhooks/) | Verify Recharge webhooks (`X-Recharge-Hmac-Sha256`, plain SHA-256 of `secret + body`, not HMAC), handle charge, subscription, and order events |
| [Recurly](https://recurly.com/developers/guides/webhooks.html) | [`recurly-webhooks`](skills/recurly-webhooks/) | Authenticate Recurly webhooks (Basic Auth), parse XML notifications for subscription and payment events |
| [Replicate](https://replicate.com/docs/webhooks) | [`replicate-webhooks`](skills/replicate-webhooks/) | Verify Replicate webhook signatures, handle ML prediction lifecycle events |
| [Resend](https://resend.com/docs/webhooks) | [`resend-webhooks`](skills/resend-webhooks/) | Verify Resend webhook signatures, handle email delivery and bounce events |
| [RingCentral](https://developers.ringcentral.com/guide/notifications/webhooks/creating-webhooks) | [`ringcentral-webhooks`](skills/ringcentral-webhooks/) | Complete the RingCentral Validation-Token handshake, check the optional Verification-Token header, handle message-store, presence, and telephony session events |
| [Retell AI](https://docs.retellai.com/features/webhook-overview) | [`retell-webhooks`](skills/retell-webhooks/) | Verify Retell webhook signatures (`X-Retell-Signature`, HMAC-SHA256), handle voice call events like call_started, call_ended, call_analyzed |
| [Revolut](https://developer.revolut.com/docs/guides/merchant/monitor-and-observe/webhooks/using-webhooks) | [`revolut-webhooks`](skills/revolut-webhooks/) | Verify Revolut Merchant API webhook signatures (`Revolut-Signature`, HMAC-SHA256 over v1.{timestamp}.{body}), handle order events |
| [Salesforce](https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_om_outboundmessaging.htm) | [`salesforce-webhooks`](skills/salesforce-webhooks/) | Handle Salesforce Outbound Messages (SOAP/XML), validate OrganizationId, return the required Ack response |
| [Sanity](https://www.sanity.io/docs/webhooks) | [`sanity-webhooks`](skills/sanity-webhooks/) | Verify Sanity GROQ-powered webhook signatures (`sanity-webhook-signature`, HMAC-SHA256 base64url), handle document change events |
| [Scrapfly](https://scrapfly.io/docs/scrape-api/webhook) | [`scrapfly-webhooks`](skills/scrapfly-webhooks/) | Verify Scrapfly webhook signatures (HMAC-SHA256, uppercase/lowercase hex), dispatch scrape, extraction, and screenshot jobs |
| [SendGrid](https://www.twilio.com/docs/sendgrid/for-developers/tracking-events/event) | [`sendgrid-webhooks`](skills/sendgrid-webhooks/) | Verify SendGrid webhook signatures (ECDSA), handle email delivery events |
| [ShipBob](https://developer.shipbob.com/2026-01/webhooks) | [`shipbob-webhooks`](skills/shipbob-webhooks/) | Verify ShipBob webhook signatures (Standard Webhooks/Svix, `webhook-signature`), dispatch on `x-webhook-topic`, handle order.shipped, delivery, return, and WRO events |
| [ShipHero](https://developer.shiphero.com/webhooks/) | [`shiphero-webhooks`](skills/shiphero-webhooks/) | Verify ShipHero webhook signatures (`x-shiphero-hmac-sha256`, base64 HMAC-SHA256 of the raw body), dispatch on the payload `webhook_type` field, handle Order Allocated, Shipment Update, Inventory Update, and Return Update events |
| [ShipStation](https://help.shipstation.com/hc/en-us/articles/360025856252-ShipStation-Webhooks) | [`shipstation-webhooks`](skills/shipstation-webhooks/) | Handle ShipStation V1 thin-payload webhooks (fetch resource_url with Basic auth), cover ORDER_NOTIFY and SHIP_NOTIFY events |
| [Shopify](https://shopify.dev/docs/apps/build/webhooks) | [`shopify-webhooks`](skills/shopify-webhooks/) | Verify Shopify HMAC signatures, handle order and product webhook events |
| [SHOPLINE](https://developer.shopline.com/docs/apps/api-instructions-for-use/webhooks/overview/) | [`shopline-webhooks`](skills/shopline-webhooks/) | Verify SHOPLINE HMAC signatures (`X-Shopline-Hmac-Sha256`, base64 with hex fallback), handle orders/create, products/update, and collect/delete events |
| [Slack](https://docs.slack.dev/apis/events-api/) | [`slack-webhooks`](skills/slack-webhooks/) | Verify Slack Events API signatures (HMAC-SHA256, `X-Slack-Signature`), handle message, app_mention, and reaction events |
| [Solidgate](https://docs.solidgate.com/payments/integrate/webhooks/) | [`solidgate-webhooks`](skills/solidgate-webhooks/) | Verify Solidgate webhook signatures (`merchant` + `signature` headers, HMAC-SHA512 with base64-of-hex double-encode), handle card_gate.order.updated, subscription.updated.v2, and chargeback events |
| [Smartcar](https://smartcar.com/docs/integrations/webhooks/overview) | [`smartcar-webhooks`](skills/smartcar-webhooks/) | Verify Smartcar webhook signatures (`SC-Signature`, hex HMAC-SHA256 keyed with the Application Management Token), answer the VERIFY challenge, handle VEHICLE_STATE and VEHICLE_ERROR events |
| [Smile API](https://docs.getsmileapi.com/reference/webhooks) | [`smile-webhooks`](skills/smile-webhooks/) | Verify Smile API (getsmileapi.com, SE Asia employment/income data — not Smile.io or Smile Identity) webhook signatures (`Smile-Signature`, HMAC-SHA512 hex over the raw body), dedupe on the event `id`, handle `ACCOUNT_CONNECTED`, `TASK_FINISHED`, `INCOMES_ADDED`, `EMPLOYMENTS_ADDED`, `IDENTITY_ADDED`, and `RECORD_COMPLETED` events |
| [Square](https://developer.squareup.com/docs/webhooks/overview) | [`square-webhooks`](skills/square-webhooks/) | Verify Square webhook signatures (`x-square-hmacsha256-signature` over URL + body), handle payment and refund events |
| [Statsig](https://docs.statsig.com/integrations/event_webhook) | [`statsig-webhooks`](skills/statsig-webhooks/) | Verify Statsig Event Webhook signatures (HMAC-SHA256 over `v0:ts:body`, `X-Statsig-Signature`), handle exposure and config-change batches |
| [Strava](https://developers.strava.com/docs/webhooks/) | [`strava-webhooks`](skills/strava-webhooks/) | Complete the Strava subscription validation handshake (`hub.challenge`/`hub.verify_token`), handle activity and athlete deauthorization events |
| [Stripe](https://docs.stripe.com/webhooks) | [`stripe-webhooks`](skills/stripe-webhooks/) | Verify Stripe webhook signatures, parse payment event payloads, handle checkout.session.completed events |
| [Synctera](https://docs.synctera.com/docs/webhooks-guide) | [`synctera-webhooks`](skills/synctera-webhooks/) | Verify Synctera BaaS webhooks (custom HMAC-SHA256 hex over `{Request-Timestamp}.{raw_body}`, `Synctera-Signature` + `Request-Timestamp` headers, secret from POST /v0/webhook_secrets, rolling secret support), handle ACCOUNT.UPDATED, CARD.CREATED, TRANSACTION.CREATED, and DISPUTE.CREATED events |
| [Tally](https://tally.so/help/webhooks) | [`tally-webhooks`](skills/tally-webhooks/) | Verify Tally webhook signatures (`Tally-Signature`, HMAC-SHA256 base64, optional signing secret), handle FORM_RESPONSE submission events |
| [Tebex](https://docs.tebex.io/developers/webhooks/overview) | [`tebex-webhooks`](skills/tebex-webhooks/) | Verify Tebex webhook signatures (`X-Signature`, two-step HMAC-SHA256 of the SHA-256 body hash), answer the `validation.webhook` handshake, handle payment, dispute, and recurring-payment events |
| [Telnyx](https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks) | [`telnyx-webhooks`](skills/telnyx-webhooks/) | Verify Telnyx Webhook API v2 signatures (Ed25519, `telnyx-signature-ed25519` + `telnyx-timestamp`), handle message.received, message.sent, and message.finalized events |
| [Token.io](https://docs.token.io/products/tpp/integration-considerations/webhooks) | [`tokenio-webhooks`](skills/tokenio-webhooks/) | Verify Token.io open banking webhook signatures (asymmetric Ed25519, `token-signature` over the raw body, `token-event` for the type), subscribe via `PUT /webhook/config`, handle `PAYMENT_STATUS_CHANGED`, `REFUND_STATUS_CHANGED`, `VRP_STATUS_CHANGED`, and `VIRTUAL_ACCOUNT_CREDIT_RECEIVED` events |
| [Treezor](https://docs.treezor.com/guide/webhooks/introduction.html) | [`treezor-webhooks`](skills/treezor-webhooks/) | Verify Treezor BaaS webhook signatures (`object_payload_signature` body field, HMAC-SHA256 base64 over the canonicalized `object_payload`, not the raw body), handle banking events like payin.create, cardtransaction.create, and user.kycreview |
| [Trello](https://developer.atlassian.com/cloud/trello/guides/rest-api/webhooks/) | [`trello-webhooks`](skills/trello-webhooks/) | Verify Trello webhook signatures (`x-trello-webhook`, HMAC-SHA1 over body + callbackURL), answer the HEAD check, handle board and card actions |
| [TikTok](https://developers.tiktok.com/doc/webhooks-overview) | [`tiktok-webhooks`](skills/tiktok-webhooks/) | Verify TikTok for Developers webhook signatures (`TikTok-Signature`, HMAC-SHA256 hex over `<timestamp>.<body>`), handle authorization.removed, video.upload.failed, video.publish.completed, and portability.download.ready events |
| [TikTok Shop](https://partner.tiktokshop.com/docv2/page/tts-webhooks-overview) | [`tiktok-shop-webhooks`](skills/tiktok-shop-webhooks/) | Verify TikTok Shop webhook signatures (`Authorization` header, HMAC-SHA256 over app_key + body), handle order, package, and product events |
| [Svix](https://docs.svix.com/receiving/introduction) | [`svix-webhooks`](skills/svix-webhooks/) | Verify Svix-delivered webhook signatures (`svix-signature`/`webhook-signature`, HMAC-SHA256) for any provider that sends webhooks via Svix |
| [Twilio](https://www.twilio.com/docs/usage/webhooks) | [`twilio-webhooks`](skills/twilio-webhooks/) | Verify Twilio webhook signatures (HMAC-SHA1, `X-Twilio-Signature`), handle SMS, voice, and status callback events |
| [USPS](https://developers.usps.com/subscriptions-trackingv3r2) | [`usps-webhooks`](skills/usps-webhooks/) | Verify USPS tracking webhook signatures (HMAC-SHA256 Base64 over `timestamp + payload`, `X-HMAC`), create tracking subscriptions, handle delivery events |
| [Uber](https://developer.uber.com/docs/eats/guides/webhooks) | [`uber-webhooks`](skills/uber-webhooks/) | Verify Uber Eats webhook signatures (HMAC-SHA256 hex, `X-Uber-Signature`, keyed with client secret), handle orders.notification, orders.cancel, and store events |
| [Upollo](https://app.upollo.ai/docs/reference/webhooks) | [`upollo-webhooks`](skills/upollo-webhooks/) | Verify Upollo fraud/risk webhook signatures (`Upollo-Signature`, `t:`/`s0:` HMAC-SHA512 over the raw body), react to flags like `ACCOUNT_SHARING` and `MULTIPLE_ACCOUNTS` and the recommended `action` (CHALLENGE/DENY/PERMIT) |
| [Utila](https://docs.utila.io/reference/webhooks) | [`utila-webhooks`](skills/utila-webhooks/) | Verify Utila webhook signatures (`x-utila-signature`, asymmetric RSA-4096 + SHA-512 + PSS, no shared secret), handle TRANSACTION_CREATED, TRANSACTION_STATE_UPDATED, WALLET_CREATED, WALLET_ADDRESS_CREATED, and TRANSACTION_AML_SCREENING_RESULT_READY events |
| [Twitch](https://dev.twitch.tv/docs/eventsub/handling-webhook-events/) | [`twitch-webhooks`](skills/twitch-webhooks/) | Verify Twitch EventSub signatures (`Twitch-Eventsub-Message-Signature`, HMAC-SHA256), answer challenges, handle stream and channel events |
| [Typeform](https://www.typeform.com/developers/webhooks/) | [`typeform-webhooks`](skills/typeform-webhooks/) | Verify Typeform webhook signatures (`Typeform-Signature`, HMAC-SHA256 base64), handle form_response events |
| [Twitter/X](https://docs.x.com/x-api/webhooks/introduction) | [`twitter-webhooks`](skills/twitter-webhooks/) | Verify Twitter/X Account Activity webhook signatures (`x-twitter-webhooks-signature`, HMAC-SHA256) and answer CRC challenges, handle tweet, favorite, and DM events |
| [Vercel](https://vercel.com/docs/observability/webhooks) | [`vercel-webhooks`](skills/vercel-webhooks/) | Verify Vercel webhook signatures (HMAC-SHA1), handle deployment and project events |
| [Walmart](https://developer.walmart.com/us-marketplace/docs/notifications-overview) | [`walmart-webhooks`](skills/walmart-webhooks/) | Verify Walmart Marketplace performance webhook signatures (`WM_SEC.SIGNATURE`, HMAC-SHA256 over method + path + timestamp + body hash), handle PO_CREATED, INVENTORY_OOS, OFFER_PUBLISHED, and BUY_BOX_CHANGED events |
| [Vercel Log Drains](https://vercel.com/docs/drains/reference/logs) | [`vercel-log-drains-webhooks`](skills/vercel-log-drains-webhooks/) | Verify Vercel Log Drain deliveries (`x-vercel-signature`, HMAC-SHA1) and the x-vercel-verify handshake, handle batched json/ndjson log events |
| [Webflow](https://developers.webflow.com/data/docs/working-with-webhooks) | [`webflow-webhooks`](skills/webflow-webhooks/) | Verify Webflow webhook signatures (HMAC-SHA256), handle form submission, ecommerce, and CMS events |
| [WeChat Pay](https://pay.weixin.qq.com/doc/global/v3/en/4012356564) | [`wechat-webhooks`](skills/wechat-webhooks/) | Verify WeChat Pay APIv3 notification signatures (`Wechatpay-Signature`, SHA256withRSA over `{timestamp}\n{nonce}\n{body}\n` with the platform public key), decrypt the AEAD_AES_256_GCM `resource`, handle TRANSACTION.SUCCESS, REFUND.SUCCESS, and REFUND.CLOSED events |
| [Wix](https://dev.wix.com/docs/build-apps/develop-your-app/api-integrations/events-and-webhooks/about-webhooks) | [`wix-webhooks`](skills/wix-webhooks/) | Verify Wix webhook JWTs (RS256 with your app's public key) for self-hosted apps, handle wix.ecom.v1.order_created, order_approved, order_updated, and order_canceled events |
| [WhatsApp](https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview) | [`whatsapp-webhooks`](skills/whatsapp-webhooks/) | Verify WhatsApp Business Platform webhook signatures (`X-Hub-Signature-256`), complete the GET handshake, handle inbound messages and status updates |
| [WooCommerce](https://developer.woocommerce.com/docs/webhooks/) | [`woocommerce-webhooks`](skills/woocommerce-webhooks/) | Verify WooCommerce webhook signatures, handle order, product, and customer events |
| [WorkOS](https://workos.com/docs/events/data-syncing/webhooks) | [`workos-webhooks`](skills/workos-webhooks/) | Verify WorkOS webhook signatures (`WorkOS-Signature`, HMAC-SHA256 with timestamp), handle Directory Sync and auth events |
| [Xero](https://developer.xero.com/documentation/guides/webhooks/overview/) | [`xero-webhooks`](skills/xero-webhooks/) | Verify Xero webhook signatures (`x-xero-signature`, HMAC-SHA256 base64), pass Intent to Receive (ITR) with 200/401, handle CONTACT, INVOICE, CREDITNOTE, and SUBSCRIPTION events |
| [Zendesk](https://developer.zendesk.com/documentation/webhooks/creating-and-monitoring-webhooks/) | [`zendesk-webhooks`](skills/zendesk-webhooks/) | Verify Zendesk webhook signatures (`X-Zendesk-Webhook-Signature`, HMAC-SHA256 with timestamp), handle event subscriptions and trigger-based webhooks |
| [Zero Hash](https://docs.zerohash.com/changelog/webhooks-tradestatus-balanceupdates) | [`zerohash-webhooks`](skills/zerohash-webhooks/) | Verify Zero Hash webhook signatures (`x-zh-hook-signature`, HMAC-SHA256 hex over `payload + timestamp` with replay protection; legacy `x-zh-hook-signature-256`), handle `trade_status_changed` and `account_balance.changed` events |
| [Zift](https://api.zift.io/#webhooks) | [`zift-webhooks`](skills/zift-webhooks/) | Receive Zift payment notifications — no HMAC signature; acknowledge each delivery by echoing `{"notificationId": ...}` — dispatch `billing.*` and `processing.*` events like `billing.subscription-created`, `processing.chargeback`, and `processing.return` |
| [Zoom](https://developers.zoom.us/docs/api/webhooks/) | [`zoom-webhooks`](skills/zoom-webhooks/) | Verify Zoom webhook signatures (`x-zm-signature`), complete the URL validation handshake, handle meeting and recording events |

### Webhook Handler Pattern Skills

Framework-agnostic best practices for webhook handling, applicable across any webhook integration.

| Skill | What It Does |
|-------|--------------|
| [`webhook-handler-patterns`](skills/webhook-handler-patterns/) | Implement webhook idempotency, error handling, retry logic, async processing |

### Webhook Infrastructure Skills

Skills for webhook infrastructure products — routing, queuing, delivery, and observability.

| Product | Skill | What It Does |
|---------|-------|--------------|
| [Hookdeck Event Gateway](https://hookdeck.com/docs) | [`hookdeck-event-gateway`](skills/hookdeck-event-gateway/) | Webhook infrastructure that replaces your queue — guaranteed delivery, retries, rate limiting, replay, observability |
| [Hookdeck Event Gateway (receiver)](https://hookdeck.com/docs/verification) | [`hookdeck-event-gateway-webhooks`](skills/hookdeck-event-gateway-webhooks/) | Verify `x-hookdeck-signature` and handle webhooks forwarded by the Hookdeck Event Gateway |
| [Hookdeck Outpost](https://outpost.hookdeck.com/docs) | [`outpost`](skills/outpost/) | Send webhooks and events to user-preferred destinations (HTTP, SQS, RabbitMQ, Pub/Sub, EventBridge, Kafka) |

### Webhook & Event Destinations DX Audit Skills

Meta-skills that evaluate the developer experience of platforms sending outbound webhooks and event destinations, rather than helping you receive or send them. "Event destinations" covers the broader case where a platform delivers events to user-chosen destinations beyond HTTP (SQS, Pub/Sub, RabbitMQ, EventBridge, Kafka), not only webhooks.

| Skill | What It Does |
|-------|--------------|
| [`webhook-dx-audit`](skills/webhook-dx-audit/) | Audit a platform's outbound webhook and event destinations DX (signing, retries, event catalog, observability, local dev, agent readiness) and produce a scored review with prioritized recommendations |

## Quick Start

### Install with `npx skills` (any AI assistant)

```bash
# List available webhook skills
npx skills add hookdeck/webhook-skills --list

# Install Stripe webhook skill
npx skills add hookdeck/webhook-skills --skill stripe-webhooks

# Install multiple webhook skills
npx skills add hookdeck/webhook-skills --skill stripe-webhooks --skill shopify-webhooks
```

### Install with `/plugin` (Claude Code)

Claude Code distributes this repo as a [plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces). Add the marketplace once, then install either a single provider skill or the bundle of all 40 skills.

```text
# Add this marketplace
/plugin marketplace add hookdeck/webhook-skills

# Install one provider skill (each is ~200 KB)
/plugin install stripe-webhooks@webhook-skills

# Or install all 40 webhook skills as one bundle (~3 MB)
/plugin install webhook-skills@webhook-skills
```

Plugin skills are namespaced with their plugin name, so the bundle exposes skills as `webhook-skills:stripe-webhooks`, `webhook-skills:shopify-webhooks`, etc., while a granular install exposes the same skill as `stripe-webhooks:stripe-webhooks`.

### Local Webhook Development

To receive webhooks on localhost during development, run [Hookdeck CLI](https://hookdeck.com/docs/cli) via `npx` — no install required:

```bash
# Start local webhook tunnel (no account required)
npx hookdeck-cli listen 3000 stripe --path /webhooks/stripe
```

This provides a public URL that forwards webhook events to your local server, plus a web UI for inspecting and replaying webhook requests.

## Example: How to Handle Stripe Webhooks

If an agent receives a `checkout.session.completed` event from Stripe, the `stripe-webhooks` skill can:

1. **Verify the webhook signature** using Stripe's signing secret
2. **Parse the event payload** to extract checkout session data
3. **Return a normalized event object** for further processing

After installing the skill, ask your AI assistant:

> "Help me set up Stripe webhook handling in my Express app"

The agent will:

1. Read `stripe-webhooks/SKILL.md` to understand webhook verification
2. Reference `stripe-webhooks/references/verification.md` for signature verification details
3. Copy code from `stripe-webhooks/examples/express/` as a starting point
4. Suggest `npx hookdeck-cli listen 3000 stripe --path /webhooks/stripe` for local webhook testing

## Example: How to Verify GitHub Webhook Signatures

If an agent needs to verify GitHub webhook authenticity, the `github-webhooks` skill can:

1. **Extract the signature header** (`X-Hub-Signature-256`)
2. **Compute HMAC-SHA256** of the raw request body
3. **Compare signatures** using timing-safe comparison

Ask your AI assistant:

> "How do I verify GitHub webhook signatures in Next.js?"

## Skill Structure

Each webhook skill follows a consistent structure:

```
skills/{provider}-webhooks/
├── SKILL.md              # Entry point — webhook overview, when to use
├── references/           # Documentation loaded on-demand
│   ├── overview.md       # What webhooks are available, common events
│   ├── setup.md          # Provider dashboard configuration
│   └── verification.md   # Webhook signature verification details
└── examples/             # Runnable webhook handler examples
    ├── express/          # Express.js webhook handler
    ├── nextjs/           # Next.js API route webhook handler
    └── fastapi/          # FastAPI webhook handler
```

Examples are complete, runnable webhook handlers following [PostHog's approach](https://posthog.com/blog/correct-llm-code-generation) — minimal code that demonstrates webhook signature verification and event handling.

## Contributing

We welcome contributions! The recommended way to add new provider webhook skills is using our AI-powered generator:

```bash
# One-time setup
cd scripts/skill-generator && npm install && cd ../..

# Generate a webhook skill (with documentation URL for best results)
./scripts/generate-skills.sh generate \
  "twilio=https://www.twilio.com/docs/usage/webhooks" \
  --create-pr
```

The generator researches the provider's webhook documentation, generates signature verification code and tests for Express/Next.js/FastAPI, validates accuracy, and creates a PR — all automatically.

**[See CONTRIBUTING.md](CONTRIBUTING.md) for the complete guide**, including:
- Providing multiple documentation URLs for better webhook skill generation
- Using YAML configs for batch webhook skill generation
- Resuming failed generations with the `review` command
- Updating existing webhook skills
- Manual contribution guidelines

## Related Resources

- [Agent Skills Specification](https://agentskills.io) — The open standard for AI agent skills
- [Skills Directory](https://skills.sh) — Discover and install agent skills
- [Hookdeck CLI](https://hookdeck.com/docs/cli) — Local webhook tunnel and debugging
- [Hookdeck Documentation](https://hookdeck.com/docs) — Webhook infrastructure platform

## License

MIT
