import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

// Set the secret BEFORE importing the route. AfterShip webhook secrets are opaque
// strings copied from the product's admin — used as UTF-8 bytes, never base64-decoded.
const TEST_SECRET = 'aftership_test_webhook_secret';
process.env.AFTERSHIP_WEBHOOK_SECRET = TEST_SECRET;

// Import after the env var is set
import {
  POST,
  GET,
  verifyAfterShipSignature,
  extractSignature,
} from '../app/webhooks/aftership/route';

/**
 * Produce a signature exactly the way AfterShip does:
 * base64(HMAC-SHA256(secret_as_utf8, raw_body)).
 */
function sign(rawBody: string, secret: string = TEST_SECRET): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('base64');
}

/** Build a NextRequest carrying the raw body and the given headers. */
function buildRequest(rawBody: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/aftership', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody,
  });
}

// ---------------------------------------------------------------------------
// Doc-sourced payloads
// ---------------------------------------------------------------------------

// AfterShip Tracking webhook-specifications sample (version 2026-07), trimmed.
const TRACKING_UPDATE = JSON.stringify({
  event: 'tracking_update',
  event_id: '94dadd60-ed26-46d0-aa52-3ced925a50ff',
  is_tracking_first_tag: true,
  msg: {
    id: '00000000000000000000000000000000',
    tracking_number: '0000000000000000',
    slug: 'usps',
    tag: 'InTransit',
    subtag: 'InTransit_001',
    subtag_message: 'In Transit',
    title: '0000000000000000',
    order_number: 'string',
    checkpoints: [
      {
        checkpoint_time: '2021-01-14T00:52:00',
        message: 'Departed Shipping Partner Facility, USPS Awaiting Item',
        slug: 'usps',
        tag: 'InTransit',
        subtag: 'InTransit_001',
      },
    ],
  },
  ts: 1712741696,
});

function trackingBody(tag: string): string {
  return JSON.stringify({
    event: 'tracking_update',
    event_id: '94dadd60-ed26-46d0-aa52-3ced925a50ff',
    is_tracking_first_tag: false,
    msg: {
      id: '00000000000000000000000000000000',
      tracking_number: '0000000000000000',
      slug: 'usps',
      tag,
      subtag: `${tag}_001`,
      subtag_message: tag,
      order_number: 'ORD-1001',
      checkpoints: [],
    },
    ts: 1712741696,
  });
}

const EDD_REVISE = JSON.stringify({
  event: 'edd_revise',
  event_id: '0a5f8c6f-0e4f-4ad9-9a0a-1b2c3d4e5f60',
  is_tracking_first_tag: false,
  msg: {
    tracking_number: '0000000000000000',
    slug: 'usps',
    tag: 'InTransit',
    aftership_estimated_delivery_date: { estimated_delivery_date: '2026-10-02' },
  },
  ts: 1712741700,
});

const TRACKING_PENDING_TIME = JSON.stringify({
  event: 'tracking_pending_time',
  event_id: 'b1e1f9a2-3c44-4d55-8e66-7f8899aabbcc',
  is_tracking_first_tag: false,
  msg: { tracking_number: '0000000000000000', slug: 'usps', tag: 'Pending' },
  ts: 1712741800,
});

// AfterShip Returns envelope: id, version, event, created_at, modified, data.
const RETURN_APPROVED = JSON.stringify({
  id: '3df04d0cdf3c492fad33a15f753fb960',
  version: '2026-07',
  event: 'return.approved',
  created_at: '2026-09-28T07:34:56.000Z',
  // `modified` is event-specific; this shape is illustrative, not documented.
  modified: { approval_status: 'approved' },
  data: {
    id: 'ret_01HZX0000000000000000000',
    rma_number: 'RMA-1001',
    approval_status: 'approved',
  },
});

// AfterShip Warranty: same header as Returns, own envelope (data.warranty + current_context).
// Shape follows the Warranty webhook reference example.
const WARRANTY_CREATED = JSON.stringify({
  id: 'c82422a62a69b4fb17c1c4a35bfcd734b',
  event: 'warranty.created',
  version: '2024-01',
  created_at: '2024-02-01T21:29:47.218678282Z',
  data: { warranty: { id: '102a899f79c82422c99b1fdc417e01010' } },
  current_context: {
    id: '102a899f79c82422c99b1fdc417e01010',
    rma_number: 'AABBCCF1',
    status: 'under_review',
  },
});

// AfterShip Shipping (Postmen): event_type, date_time, meta, data.
const CREATE_A_LABEL = JSON.stringify({
  event_type: 'create_a_label',
  date_time: '2026-09-28T07:34:56.000Z',
  meta: { code: 200, message: 'OK', details: [] },
  data: {
    id: 'lbl_01HZX0000000000000000000',
    status: 'created',
    files: { label: { url: 'https://sandbox-api.postmen.com/download/labels/label.pdf' } },
  },
});

describe('AfterShip Webhook Handler (Next.js App Router)', () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    process.env.AFTERSHIP_WEBHOOK_SECRET = TEST_SECRET;
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  const logged = () => logSpy.mock.calls.map((args) => args.join(' ')).join('\n');
  const errored = () => errorSpy.mock.calls.flat().join(' ');

  describe('GET /webhooks/aftership', () => {
    it('returns health status', async () => {
      const response = await GET();
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ status: 'ok' });
    });
  });

  describe('verifyAfterShipSignature', () => {
    it('accepts a Tracking signature in aftership-hmac-sha256', () => {
      const headers = new Headers({ 'aftership-hmac-sha256': sign(TRACKING_UPDATE) });
      const result = verifyAfterShipSignature(TRACKING_UPDATE, headers, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.product).toBe('tracking');
    });

    it('accepts a Returns/Warranty signature in as-signature-hmac-sha256', () => {
      const headers = new Headers({ 'as-signature-hmac-sha256': sign(RETURN_APPROVED) });
      const result = verifyAfterShipSignature(RETURN_APPROVED, headers, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.product).toBe('returns/warranty');
    });

    it('accepts a Shipping signature in am-webhook-signature with the hmac-sha256= prefix', () => {
      const headers = new Headers({
        'am-webhook-signature': `hmac-sha256=${sign(CREATE_A_LABEL)}`,
      });
      const result = verifyAfterShipSignature(CREATE_A_LABEL, headers, TEST_SECRET);
      expect(result.valid).toBe(true);
      expect(result.product).toBe('shipping');
    });

    it('accepts a bare digest in am-webhook-signature too', () => {
      const headers = new Headers({ 'am-webhook-signature': sign(CREATE_A_LABEL) });
      expect(verifyAfterShipSignature(CREATE_A_LABEL, headers, TEST_SECRET).valid).toBe(true);
    });

    it('produces a standard base64 digest, not hex', () => {
      const digest = sign(TRACKING_UPDATE);
      expect(digest).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
      expect(digest).toHaveLength(44);
    });

    it('rejects a signature generated with the wrong secret', () => {
      const headers = new Headers({
        'aftership-hmac-sha256': sign(TRACKING_UPDATE, 'a_different_secret'),
      });
      expect(verifyAfterShipSignature(TRACKING_UPDATE, headers, TEST_SECRET)).toMatchObject({
        valid: false,
        reason: 'signature_mismatch',
      });
    });

    it('rejects when no signature header is present', () => {
      const headers = new Headers({ 'content-type': 'application/json' });
      expect(verifyAfterShipSignature(TRACKING_UPDATE, headers, TEST_SECRET)).toMatchObject({
        valid: false,
        reason: 'missing_signature_header',
      });
    });

    it('fails closed when the secret is missing', () => {
      const headers = new Headers({ 'aftership-hmac-sha256': sign(TRACKING_UPDATE) });
      expect(verifyAfterShipSignature(TRACKING_UPDATE, headers, undefined)).toMatchObject({
        valid: false,
        reason: 'missing_secret',
      });
    });

    it('does not throw on a signature of a different length', () => {
      // crypto.timingSafeEqual throws on a length mismatch — the helper guards it.
      const headers = new Headers({ 'aftership-hmac-sha256': 'short' });
      expect(() => verifyAfterShipSignature(TRACKING_UPDATE, headers, TEST_SECRET)).not.toThrow();
    });

    it('prefers aftership-hmac-sha256 when several headers are present', () => {
      const found = extractSignature(
        new Headers({
          'aftership-hmac-sha256': 'tracking-sig',
          'as-signature-hmac-sha256': 'returns-sig',
          'am-webhook-signature': 'hmac-sha256=shipping-sig',
        })
      );
      expect(found).toEqual({
        header: 'aftership-hmac-sha256',
        product: 'tracking',
        signature: 'tracking-sig',
      });
    });
  });

  describe('POST /webhooks/aftership - signature handling', () => {
    it('accepts a valid Tracking signature (aftership-hmac-sha256)', async () => {
      const response = await POST(
        buildRequest(TRACKING_UPDATE, { 'aftership-hmac-sha256': sign(TRACKING_UPDATE) })
      );
      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ received: true });
    });

    it('accepts the header in the documented mixed case (Aftership-Hmac-Sha256)', async () => {
      const response = await POST(
        buildRequest(TRACKING_UPDATE, { 'Aftership-Hmac-Sha256': sign(TRACKING_UPDATE) })
      );
      expect(response.status).toBe(200);
    });

    it('accepts a valid Returns signature (as-signature-hmac-sha256)', async () => {
      const response = await POST(
        buildRequest(RETURN_APPROVED, { 'as-signature-hmac-sha256': sign(RETURN_APPROVED) })
      );
      expect(response.status).toBe(200);
    });

    it('accepts a valid Shipping signature (am-webhook-signature, hmac-sha256= prefixed)', async () => {
      const response = await POST(
        buildRequest(CREATE_A_LABEL, {
          'am-webhook-signature': `hmac-sha256=${sign(CREATE_A_LABEL)}`,
        })
      );
      expect(response.status).toBe(200);
    });

    it('accepts a legacy Returns delivery (am-webhook-signature with prefix)', async () => {
      const response = await POST(
        buildRequest(RETURN_APPROVED, {
          'am-webhook-signature': `hmac-sha256=${sign(RETURN_APPROVED)}`,
        })
      );
      expect(response.status).toBe(200);
    });

    it('rejects a signature generated with the wrong secret with 401', async () => {
      const response = await POST(
        buildRequest(TRACKING_UPDATE, {
          'aftership-hmac-sha256': sign(TRACKING_UPDATE, 'wrong_secret'),
        })
      );
      expect(response.status).toBe(401);
    });

    it('rejects a tampered body with 401', async () => {
      const signature = sign(TRACKING_UPDATE);
      const tampered = TRACKING_UPDATE.replace('"InTransit"', '"Delivered"');
      expect(tampered).not.toBe(TRACKING_UPDATE);
      const response = await POST(
        buildRequest(tampered, { 'aftership-hmac-sha256': signature })
      );
      expect(response.status).toBe(401);
    });

    it('rejects a missing signature header with 401', async () => {
      const response = await POST(buildRequest(TRACKING_UPDATE));
      expect(response.status).toBe(401);
    });

    it('returns 500 (fail closed) when AFTERSHIP_WEBHOOK_SECRET is missing', async () => {
      const saved = process.env.AFTERSHIP_WEBHOOK_SECRET;
      delete process.env.AFTERSHIP_WEBHOOK_SECRET;
      try {
        const response = await POST(
          buildRequest(TRACKING_UPDATE, { 'aftership-hmac-sha256': sign(TRACKING_UPDATE) })
        );
        expect(response.status).toBe(500);
      } finally {
        process.env.AFTERSHIP_WEBHOOK_SECRET = saved;
      }
    });

    it('returns 400 for a correctly signed body that is not JSON', async () => {
      const body = 'not json at all';
      const response = await POST(
        buildRequest(body, { 'aftership-hmac-sha256': sign(body) })
      );
      expect(response.status).toBe(400);
    });
  });

  describe('POST /webhooks/aftership - Tracking events', () => {
    it('handles tracking_update and routes on msg.tag', async () => {
      await POST(
        buildRequest(TRACKING_UPDATE, { 'aftership-hmac-sha256': sign(TRACKING_UPDATE) })
      );
      expect(logged()).toContain('tracking_update');
      expect(logged()).toContain('94dadd60-ed26-46d0-aa52-3ced925a50ff');
      expect(logged()).toContain('In transit');
    });

    it.each([
      ['Pending', 'Pending'],
      ['InfoReceived', 'Info received'],
      ['InTransit', 'In transit'],
      ['OutForDelivery', 'Out for delivery'],
      ['AttemptFail', 'Delivery attempt failed'],
      ['Delivered', 'Delivered'],
      ['AvailableForPickup', 'Available for pickup'],
      ['Exception', 'Exception on'],
      ['Expired', 'Expired'],
    ])('handles msg.tag %s', async (tag, expected) => {
      const body = trackingBody(tag);
      const response = await POST(
        buildRequest(body, { 'aftership-hmac-sha256': sign(body) })
      );
      expect(response.status).toBe(200);
      expect(logged()).toContain(expected);
    });

    it('handles edd_revise', async () => {
      await POST(buildRequest(EDD_REVISE, { 'aftership-hmac-sha256': sign(EDD_REVISE) }));
      expect(logged()).toContain('EDD revised');
    });

    it('handles tracking_pending_time', async () => {
      await POST(
        buildRequest(TRACKING_PENDING_TIME, {
          'aftership-hmac-sha256': sign(TRACKING_PENDING_TIME),
        })
      );
      expect(logged()).toContain('pending past the configured threshold');
    });

    it('acknowledges an unknown Tracking event with 200', async () => {
      const body = JSON.stringify({ event: 'some_future_event', event_id: 'x', msg: {}, ts: 1 });
      const response = await POST(
        buildRequest(body, { 'aftership-hmac-sha256': sign(body) })
      );
      expect(response.status).toBe(200);
      expect(logged()).toContain('Unhandled Tracking event');
    });

    it('acknowledges an unknown msg.tag with 200', async () => {
      const body = trackingBody('SomeFutureTag');
      const response = await POST(
        buildRequest(body, { 'aftership-hmac-sha256': sign(body) })
      );
      expect(response.status).toBe(200);
      expect(logged()).toContain('Unhandled tracking tag');
    });

    it('logs the as-webhook-version header when present', async () => {
      await POST(
        buildRequest(TRACKING_UPDATE, {
          'aftership-hmac-sha256': sign(TRACKING_UPDATE),
          'as-webhook-version': '2026-07',
        })
      );
      expect(logged()).toContain('version 2026-07');
    });
  });

  describe('POST /webhooks/aftership - Returns and Warranty events', () => {
    it('handles return.approved', async () => {
      await POST(
        buildRequest(RETURN_APPROVED, { 'as-signature-hmac-sha256': sign(RETURN_APPROVED) })
      );
      expect(logged()).toContain('return.approved');
      expect(logged()).toContain('RMA-1001');
    });

    it('handles warranty.created', async () => {
      await POST(
        buildRequest(WARRANTY_CREATED, { 'as-signature-hmac-sha256': sign(WARRANTY_CREATED) })
      );
      expect(logged()).toContain('warranty.created');
    });

    it('acknowledges an unknown Returns event with 200 (enums are open strings)', async () => {
      const body = JSON.stringify({ id: 'x', event: 'return.something.new', data: {} });
      const response = await POST(
        buildRequest(body, { 'as-signature-hmac-sha256': sign(body) })
      );
      expect(response.status).toBe(200);
      expect(logged()).toContain('Unhandled Returns event');
    });
  });

  describe('POST /webhooks/aftership - Shipping events', () => {
    it('handles create_a_label', async () => {
      await POST(
        buildRequest(CREATE_A_LABEL, {
          'am-webhook-signature': `hmac-sha256=${sign(CREATE_A_LABEL)}`,
        })
      );
      expect(logged()).toContain('create_a_label');
      expect(logged()).toContain('label.pdf');
    });

    it('reports a failed Shipping operation from meta.code', async () => {
      const body = JSON.stringify({
        event_type: 'create_a_label',
        date_time: '2026-09-28T07:34:56.000Z',
        meta: { code: 4153, message: 'Invalid shipper account', details: [] },
        data: {},
      });
      await POST(buildRequest(body, { 'am-webhook-signature': `hmac-sha256=${sign(body)}` }));
      expect(errored()).toContain('Invalid shipper account');
    });

    it.each(['calculate_rates', 'cancel_a_label', 'manifest_a_label'])(
      'handles %s',
      async (eventType) => {
        const body = JSON.stringify({
          event_type: eventType,
          date_time: '2026-09-28T07:34:56.000Z',
          meta: { code: 200, message: 'OK', details: [] },
          data: { id: 'obj_1', status: 'done', rates: [] },
        });
        const response = await POST(
          buildRequest(body, { 'am-webhook-signature': `hmac-sha256=${sign(body)}` })
        );
        expect(response.status).toBe(200);
        expect(logged()).toContain(eventType);
      }
    );
  });
});
