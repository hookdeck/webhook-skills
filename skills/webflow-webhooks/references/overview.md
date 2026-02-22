# Webflow Webhooks Overview

## What Are Webflow Webhooks?

Webflow webhooks are HTTP callbacks that notify your application when events occur in a Webflow site. They enable real-time integration with external systems, allowing you to react to form submissions, content changes, ecommerce orders, and site publishing events.

## Common Event Types

| Event | Triggered When | Common Use Cases |
|-------|----------------|------------------|
| `form_submission` | A form is submitted on your site | Lead capture, email notifications, CRM integration |
| `site_publish` | Site is published | Clear CDN caches, trigger static site builds, notify team |
| `page_created` | New page created | Content auditing, SEO tools integration |
| `page_metadata_updated` | Page metadata changes | Update sitemap, SEO monitoring |
| `page_deleted` | Page is deleted | Remove from external indexes, cleanup |
| `ecomm_new_order` | New ecommerce order placed | Order processing, inventory management, fulfillment |
| `ecomm_order_changed` | Order status/details change | Update shipping, customer notifications |
| `ecomm_inventory_changed` | Product inventory changes | Sync with external inventory systems |
| `user_account_added` | New user account created | Welcome emails, user provisioning |
| `user_account_updated` | User account details change | Sync user data, audit trail |
| `user_account_deleted` | User account deleted | Cleanup, GDPR compliance |
| `collection_item_created` | CMS item created | Content syndication, search indexing |
| `collection_item_changed` | CMS item updated | Update external systems, clear caches |
| `collection_item_deleted` | CMS item deleted | Remove from external systems |
| `collection_item_unpublished` | CMS item unpublished | Update content visibility |

## Event Payload Structure

All Webflow webhook events follow a consistent structure:

```json
{
  "triggerType": "event_name",
  "payload": {
    // Event-specific data
  }
}
```

### Example: Form Submission Event

```json
{
  "triggerType": "form_submission",
  "payload": {
    "name": "Contact Us Form",
    "siteId": "65427cf400e02b306eaa049c",
    "data": {
      "First Name": "John",
      "Last Name": "Doe",
      "email": "john.doe@example.com",
      "message": "I'd like to learn more about your services"
    },
    "submittedAt": "2024-01-15T14:30:00.000Z",
    "id": "65a5d3c8f7e2b40012345678"
  }
}
```

### Example: Ecommerce Order Event

```json
{
  "triggerType": "ecomm_new_order",
  "payload": {
    "orderId": "65a5d4e9f7e2b40012345679",
    "status": "pending",
    "customerId": "65a5d4e9f7e2b40012345680",
    "total": 149.99,
    "currency": "USD",
    "items": [
      {
        "productId": "65a5d4e9f7e2b40012345681",
        "name": "Premium Widget",
        "quantity": 2,
        "price": 74.99
      }
    ],
    "createdOn": "2024-01-15T14:35:00.000Z"
  }
}
```

### Example: CMS Collection Item Event

```json
{
  "triggerType": "collection_item_created",
  "payload": {
    "_id": "65a5d5f2f7e2b40012345682",
    "name": "New Blog Post Title",
    "slug": "new-blog-post-title",
    "_cid": "65a5d5f2f7e2b40012345683",
    "_draft": false,
    "fields": {
      "title": "New Blog Post Title",
      "content": "Post content here...",
      "author": "Jane Smith",
      "publishDate": "2024-01-15T00:00:00.000Z"
    }
  }
}
```

## Webhook Limits

| Criteria | Limit |
|----------|-------|
| Max webhooks per trigger type | 75 |
| Retry attempts on failure | 3 |
| Retry interval | 10 minutes |
| Request timeout | 30 seconds |
| Max payload size | 256 KB |

## Security Considerations

- **Signature Verification**: Webhooks created via OAuth apps or API include signature headers for verification
- **HTTPS Only**: Webhook endpoints must use HTTPS in production
- **Timestamp Validation**: Check timestamps to prevent replay attacks (5-minute window)
- **Raw Body**: Always use the raw request body for signature verification

## Full Event Reference

For the complete list of events and their payload structures, see [Webflow's webhook documentation](https://developers.webflow.com/data/docs/working-with-webhooks).