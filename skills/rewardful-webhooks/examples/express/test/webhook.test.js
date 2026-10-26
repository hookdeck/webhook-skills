const crypto = require('crypto');
const request = require('supertest');

// Set test environment variables before importing the app
process.env.REWARDFUL_WEBHOOK_SECRET = 'test_rewardful_signing_secret_0123456789';

const app = require('../src/index');
const { verifyRewardfulSignature, seenEvents } = require('../src/index');

const SECRET = process.env.REWARDFUL_WEBHOOK_SECRET;

// Payload as shown in Rewardful's docs (https://developers.rewardful.com/webhooks/requests#example-payload)
const AFFILIATE_CONFIRMED = {
  object: {
    id: '3433fffa-8255-4843-81b1-22aebc21eb34',
    first_name: 'James',
    last_name: 'Bond',
    email: 'james@mi6.co.uk',
    created_at: '2019-06-24T00:43:36.097Z',
    updated_at: '2019-06-27T18:38:41.684Z',
    referrals: 42,
    conversions: 3,
    confirmed_at: '2019-06-24T00:43:36.095Z',
    links: [
      {
        id: '81bf1128-0ba1-4c1c-835c-286521f8791a',
        url: 'http://www.demo.com:8080/?via=james',
        token: 'james',
        referrals: 42,
        conversions: 3
      }
    ],
    campaign: { id: '82f26208-778e-4e98-a467-6ee264cf96d5', name: 'Friends of Acme' },
    paypal_email: null,
    sign_in_count: 0,
    stripe_account_id: null,
    unconfirmed_email: null,
    stripe_customer_id: null,
    paypal_email_confirmed_at: null,
    receive_new_commission_notifications: true
  },
  event: {
    id: '7fcdc81d-996a-4b7b-8faf-1db98b9d5507',
    type: 'affiliate.confirmed',
    created_at: '2019-07-11T05:25:43.940Z',
    api_version: 'v1'
  },
  request: { id: '66a94f49-2b36-403c-83b8-91677cb1f460' }
};

const HANDLED_EVENTS = [
  'affiliate.created', 'affiliate.confirmed', 'referral.lead', 'referral.converted',
  'sale.created', 'sale.refunded', 'commission.created', 'commission.paid',
  'payout.due', 'payout.paid', 'payout.failed'
];

let counter = 0;
function samplePayload(type) {
  return {
    object: { id: `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}` },
    event: { id: `evt-${counter}`, type, created_at: '2019-07-11T05:25:43.940Z', api_version: 'v1' },
    request: { id: `req-${counter}` }
  };
}

// Same algorithm as Rewardful: lowercase hex HMAC-SHA256 of the raw body, no prefix
function sign(body, secret = SECRET) {
  return crypto.createHmac('sha256', secret).update(body).digest('hex');
}

function post(body, signature, contentType = 'application/json') {
  const req = request(app)
    .post('/webhooks/rewardful')
    .set('Content-Type', contentType);
  if (signature !== undefined) req.set('X-Rewardful-Signature', signature);
  return req.send(body);
}

beforeEach(() => seenEvents.clear());

describe('Rewardful webhook endpoint', () => {
  describe('signature verification', () => {
    const body = JSON.stringify(AFFILIATE_CONFIRMED);

    it('accepts a valid signature', async () => {
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('accepts an uppercase hex signature (hex is case-insensitive)', async () => {
      const res = await post(body, sign(body).toUpperCase());
      expect(res.status).toBe(200);
    });

    it('verifies the exact bytes, whatever the content type', async () => {
      const res = await post(body, sign(body), 'text/plain');
      expect(res.status).toBe(200);
    });

    it('verifies non-canonical JSON bytes (whitespace is preserved)', async () => {
      const pretty = JSON.stringify(AFFILIATE_CONFIRMED, null, 2);
      expect((await post(pretty, sign(pretty))).status).toBe(200);
      // A signature over the compact form does not match the pretty body
      expect((await post(pretty, sign(body))).status).toBe(401);
    });

    it('rejects a wrong secret', async () => {
      const res = await post(body, sign(body, 'wrong_secret'));
      expect(res.status).toBe(401);
    });

    it('rejects a tampered body', async () => {
      const res = await post(body.replace('James', 'Jamie'), sign(body));
      expect(res.status).toBe(401);
    });

    it('rejects a missing signature', async () => {
      const res = await post(body);
      expect(res.status).toBe(401);
    });

    it('rejects an empty signature', async () => {
      const res = await post(body, '');
      expect(res.status).toBe(401);
    });

    it('rejects a signature with a sha256= prefix (bare hex only)', async () => {
      const res = await post(body, `sha256=${sign(body)}`);
      expect(res.status).toBe(401);
    });

    it('rejects a signature of the wrong length', async () => {
      const res = await post(body, sign(body).slice(0, 62));
      expect(res.status).toBe(401);
    });

    it('rejects a non-hex signature of the right length', async () => {
      const res = await post(body, 'z'.repeat(64));
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is unset', () => {
      const raw = Buffer.from(body);
      expect(verifyRewardfulSignature(raw, sign(body), '')).toBe(false);
      expect(verifyRewardfulSignature(raw, sign(body), SECRET)).toBe(true);
    });

    it('rejects a body that is not a Buffer', () => {
      expect(verifyRewardfulSignature(body, sign(body), SECRET)).toBe(false);
    });
  });

  describe('body handling', () => {
    it('returns 400 for invalid JSON with a valid signature', async () => {
      const bad = '{not json';
      const res = await post(bad, sign(bad));
      expect(res.status).toBe(400);
    });

    it('returns 400 for a non-object JSON body', async () => {
      const arr = '[1,2]';
      const res = await post(arr, sign(arr));
      expect(res.status).toBe(400);
    });

    it('returns 401, not 400, for invalid JSON without a signature', async () => {
      const res = await post('{not json');
      expect(res.status).toBe(401);
    });
  });

  describe('event handling', () => {
    it('handles the documented affiliate.confirmed payload', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(AFFILIATE_CONFIRMED);
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith(
        'Affiliate confirmed: james@mi6.co.uk (3433fffa-8255-4843-81b1-22aebc21eb34)'
      );
      spy.mockRestore();
    });

    it.each(HANDLED_EVENTS)('handles %s', async (type) => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload(type));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(spy.mock.calls.some(([m]) => String(m).startsWith('Unhandled'))).toBe(false);
      spy.mockRestore();
    });

    it('acknowledges events it does not handle', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(samplePayload('affiliate_coupon.activated'));
      const res = await post(body, sign(body));
      expect(res.status).toBe(200);
      expect(spy).toHaveBeenCalledWith('Unhandled event: affiliate_coupon.activated');
      spy.mockRestore();
    });

    it('acknowledges a repeated event.id without reprocessing it', async () => {
      const spy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const body = JSON.stringify(AFFILIATE_CONFIRMED);
      const first = await post(body, sign(body));
      const second = await post(body, sign(body));
      expect(first.body).toEqual({ received: true });
      expect(second.status).toBe(200);
      expect(second.body).toEqual({ received: true, duplicate: true });
      expect(spy.mock.calls.filter(([m]) => String(m).startsWith('Affiliate confirmed'))).toHaveLength(1);
      spy.mockRestore();
    });
  });

  it('health check works', async () => {
    const res = await request(app).get('/health');
    expect(res.body).toEqual({ status: 'ok' });
  });
});
