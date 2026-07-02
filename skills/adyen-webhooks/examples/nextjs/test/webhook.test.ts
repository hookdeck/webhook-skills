import { describe, it, expect, beforeAll } from 'vitest';
import { hmacValidator } from '@adyen/api-library';
import { NextRequest } from 'next/server';

// A valid HEX HMAC key (as generated in the Adyen Customer Area).
const HMAC_KEY = '44782DEF547AAA06C910C43932B1EB0C71FC68D9D0C057550C48EC2ACF6BA056';

beforeAll(() => {
  process.env.ADYEN_HMAC_KEY = HMAC_KEY;
});

const validator = new hmacValidator();

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function baseItem(overrides: Record<string, any> = {}): Record<string, any> {
  return {
    pspReference: '7914073381342284',
    originalReference: '',
    merchantAccountCode: 'TestMerchant',
    merchantReference: 'TestPayment-1407325143704',
    amount: { value: 1130, currency: 'EUR' },
    eventCode: 'AUTHORISATION',
    success: 'true',
    ...overrides,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function sign(item: Record<string, any>): Record<string, any> {
  const signature = validator.calculateHmac(item as never, HMAC_KEY);
  return { ...item, additionalData: { ...(item.additionalData || {}), hmacSignature: signature } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeRequest(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost:3000/webhooks/adyen', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: JSON.stringify(body),
  });
}

// Import after env + helpers are set up.
import { POST } from '../app/webhooks/adyen/route';

describe('Adyen HMAC verification (SDK)', () => {
  it('validates a signature it generated', () => {
    const item = sign(baseItem());
    expect(validator.validateHMAC(item as never, HMAC_KEY)).toBe(true);
  });

  it('rejects a tampered amount', () => {
    const item = sign(baseItem());
    item.amount.value = 9999;
    expect(validator.validateHMAC(item as never, HMAC_KEY)).toBe(false);
  });
});

describe('POST /webhooks/adyen', () => {
  it('returns 200 and [accepted] for a valid signature', async () => {
    const body = { live: 'false', notificationItems: [{ NotificationRequestItem: sign(baseItem()) }] };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('[accepted]');
  });

  it('returns 401 for an invalid signature', async () => {
    const item = { ...baseItem(), additionalData: { hmacSignature: 'invalid_signature' } };
    const body = { live: 'false', notificationItems: [{ NotificationRequestItem: item }] };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
  });

  it('returns 401 for a missing signature', async () => {
    const body = { live: 'false', notificationItems: [{ NotificationRequestItem: baseItem() }] };
    const res = await POST(makeRequest(body));
    expect(res.status).toBe(401);
  });

  it('returns 400 for a malformed body', async () => {
    const res = await POST(makeRequest({ foo: 'bar' }));
    expect(res.status).toBe(400);
  });

  it('handles the common event codes', async () => {
    const eventCodes = [
      'AUTHORISATION',
      'CAPTURE',
      'CAPTURE_FAILED',
      'REFUND',
      'REFUND_FAILED',
      'CANCELLATION',
      'CANCEL_OR_REFUND',
      'CHARGEBACK',
      'NOTIFICATION_OF_CHARGEBACK',
      'REPORT_AVAILABLE',
    ];

    for (const eventCode of eventCodes) {
      const body = {
        live: 'false',
        notificationItems: [{ NotificationRequestItem: sign(baseItem({ eventCode })) }],
      };
      const res = await POST(makeRequest(body));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('[accepted]');
    }
  });

  it('rejects a batch when any item is invalid', async () => {
    const good = { NotificationRequestItem: sign(baseItem()) };
    const bad = {
      NotificationRequestItem: { ...baseItem({ eventCode: 'CAPTURE' }), additionalData: { hmacSignature: 'nope' } },
    };
    const res = await POST(makeRequest({ live: 'false', notificationItems: [good, bad] }));
    expect(res.status).toBe(401);
  });

  it('enforces Basic Auth when configured', async () => {
    process.env.ADYEN_WEBHOOK_USERNAME = 'user';
    process.env.ADYEN_WEBHOOK_PASSWORD = 'pass';
    try {
      const body = { live: 'false', notificationItems: [{ NotificationRequestItem: sign(baseItem()) }] };

      const denied = await POST(makeRequest(body));
      expect(denied.status).toBe(401);

      const creds = Buffer.from('user:pass').toString('base64');
      const allowed = await POST(makeRequest(body, { Authorization: `Basic ${creds}` }));
      expect(allowed.status).toBe(200);
    } finally {
      delete process.env.ADYEN_WEBHOOK_USERNAME;
      delete process.env.ADYEN_WEBHOOK_PASSWORD;
    }
  });
});
