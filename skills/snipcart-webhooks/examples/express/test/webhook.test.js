// Generated with: snipcart-webhooks skill
// https://github.com/hookdeck/webhook-skills

// Snipcart does NOT sign webhooks, so there is no signature to generate here.
// Verification is a network call to Snipcart's request-validation API, so every
// test stubs global fetch and asserts both the decision and the shape of the
// outbound call.

const TEST_SECRET_KEY = 'SecretApiKeyForTests';
process.env.SNIPCART_SECRET_API_KEY = TEST_SECRET_KEY;

const request = require('supertest');
const { app, validateRequestToken, basicAuthHeader, VALIDATION_ENDPOINT } = require('../src');

// Observed Snipcart tokens are UUIDs.
const TOKEN = '252e5ce5-7450-4ab4-bcda-57f1e7f6a51d';
const EXPECTED_URL = `${VALIDATION_ENDPOINT}/${TOKEN}`;
const EXPECTED_AUTH = `Basic ${Buffer.from(`${TEST_SECRET_KEY}:`, 'utf8').toString('base64')}`;

const ORDER_COMPLETED = {
  eventName: 'order.completed',
  mode: 'Test',
  createdOn: '2026-09-28T14:03:11.000Z',
  content: {
    token: 'a1b2c3d4-0000-1111-2222-333344445555',
    invoiceNumber: 'SNIP-1042',
    email: 'customer@example.com',
    status: 'InProgress',
    paymentStatus: 'Paid',
    currency: 'usd',
    grandTotal: 120.5,
    finalGrandTotal: 120.5,
    items: [{ uniqueId: 'i1', name: 'Blue widget', totalPrice: 100, quantity: 1 }],
    shippingAddress: { country: 'US', postalCode: '90210' },
    totalWeight: 500,
  },
};

/** Stub global fetch with a response of the given status. */
function mockValidation(status, body = { token: TOKEN, resource: '/webhooks/snipcart' }) {
  return jest.spyOn(globalThis, 'fetch').mockResolvedValue({
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
    text: async () => JSON.stringify(body),
  });
}

function post(path, payload, token = TOKEN) {
  const req = request(app).post(path).set('Content-Type', 'application/json');
  if (token !== null) req.set('X-Snipcart-RequestToken', token);
  return req.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

afterEach(() => {
  jest.restoreAllMocks();
  process.env.SNIPCART_SECRET_API_KEY = TEST_SECRET_KEY;
});

describe('request token validation', () => {
  test('accepts the webhook when Snipcart returns 200', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({ received: true });
  });

  test('calls the exact validation URL with Basic auth and no redirect following', async () => {
    const fetchSpy = mockValidation(200);
    await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe(EXPECTED_URL);
    expect(init.method).toBe('GET');
    expect(init.headers.Authorization).toBe(EXPECTED_AUTH);
    expect(init.headers.Accept).toBe('application/json');
    expect(init.redirect).toBe('manual');
    expect(init.signal).toBeDefined();
  });

  test('the Basic credential is base64 of "key:" — the trailing colon matters', () => {
    expect(basicAuthHeader('secret')).toBe(`Basic ${Buffer.from('secret:').toString('base64')}`);
    expect(basicAuthHeader('secret')).not.toBe(`Basic ${Buffer.from('secret').toString('base64')}`);
  });

  test('rejects with 401 when Snipcart returns 404 (unknown/expired/already validated)', async () => {
    mockValidation(404);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('unknown_token');
  });

  test('rejects with 401 when Snipcart returns 401 (bad secret key or wrong mode)', async () => {
    mockValidation(401);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('validation_unauthorized');
  });

  test('fails closed on a 500 from Snipcart', async () => {
    mockValidation(500);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('upstream_error');
  });

  test('does not treat a redirect as success', async () => {
    mockValidation(302);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
  });

  test('rejects a missing header without calling Snipcart', async () => {
    const fetchSpy = mockValidation(200);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED, null);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('rejects an empty header without calling Snipcart', async () => {
    const fetchSpy = mockValidation(200);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED, '   ');

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('missing_token');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test.each(['..', '../orders', 'a/b', 'token?x=1', 'tok en', 'tok.en', '%2e%2e'])(
    'rejects the malicious token %p without calling Snipcart',
    async (badToken) => {
      const fetchSpy = mockValidation(200);
      const res = await post('/webhooks/snipcart', ORDER_COMPLETED, badToken);

      expect(res.status).toBe(401);
      expect(res.body.reason).toBe('malformed_token');
      expect(fetchSpy).not.toHaveBeenCalled();
    }
  );

  test('fails closed on a network error', async () => {
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('fetch failed'));
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('upstream_unreachable');
  });

  test('fails closed on a timeout', async () => {
    const abort = new Error('The operation was aborted due to timeout');
    abort.name = 'TimeoutError';
    jest.spyOn(globalThis, 'fetch').mockRejectedValue(abort);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(401);
    expect(res.body.reason).toBe('upstream_unreachable');
  });

  test('returns 500 when SNIPCART_SECRET_API_KEY is unset — never fails open', async () => {
    delete process.env.SNIPCART_SECRET_API_KEY;
    const fetchSpy = mockValidation(200);
    const res = await post('/webhooks/snipcart', ORDER_COMPLETED);

    expect(res.status).toBe(500);
    expect(res.body).toEqual({ error: 'server_misconfigured' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  test('validateRequestToken throws a configuration error with no key', async () => {
    delete process.env.SNIPCART_SECRET_API_KEY;
    const fetchSpy = mockValidation(200);

    await expect(validateRequestToken(TOKEN)).rejects.toThrow(/SNIPCART_SECRET_API_KEY/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe('payload handling', () => {
  test('returns 400 for an unparsable body', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', 'not json');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_json' });
  });

  test('returns 400 when eventName is missing', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', { mode: 'Test', content: {} });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'missing_event_name' });
  });

  test('handles order.status.changed with its top-level from/to', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', {
      eventName: 'order.status.changed',
      mode: 'Live',
      createdOn: '2026-09-28T14:10:00.000Z',
      from: 'InProgress',
      to: 'Shipped',
      content: { token: ORDER_COMPLETED.content.token },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('handles the v3/-prefixed subscription events', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', {
      eventName: 'v3/subscription.invoice.payment.succeeded',
      mode: 'Live',
      createdOn: '2026-09-28T14:20:00.000Z',
      content: {
        order: { token: 'order-token' },
        subscription: {
          id: 'sub_123',
          state: 'Active',
          nextBillingDate: '2026-10-28T00:00:00.000Z',
          card: { last4: '4242', brand: 'Visa' },
        },
      },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });

  test('acknowledges unknown event names instead of erroring', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart', {
      eventName: 'order.somethingNew',
      mode: 'Live',
      createdOn: '2026-09-28T14:30:00.000Z',
      content: { token: 'x', aFieldAddedWithoutNotice: true },
    });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true });
  });
});

describe('synchronous webhooks', () => {
  test('shippingrates.fetch returns a rates array', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart/shipping-rates', {
      eventName: 'shippingrates.fetch',
      mode: 'Test',
      createdOn: '2026-09-28T14:40:00.000Z',
      content: ORDER_COMPLETED.content,
    });

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(Array.isArray(res.body.rates)).toBe(true);
    for (const rate of res.body.rates) {
      expect(typeof rate.cost).toBe('number');
      expect(typeof rate.description).toBe('string');
    }
    expect(new Set(res.body.rates.map((r) => r.userDefinedId)).size).toBe(res.body.rates.length);
  });

  test('shippingrates.fetch reads the documented FLAT address fields', async () => {
    mockValidation(200);
    // Shape of the documented shippingrates.fetch example: flat
    // shippingAddress* fields, no nested shippingAddress object.
    const res = await post('/webhooks/snipcart/shipping-rates', {
      eventName: 'shippingrates.fetch',
      mode: 'Live',
      createdOn: '2015-02-21T14:58:02.6738454Z',
      content: {
        token: '22808196-0eff-4a6e-b136-3e4d628b3cf5',
        currency: 'USD',
        shippingAddressCountry: 'CA',
        shippingAddressProvince: 'QC',
        shippingAddressPostalCode: 'G1G 1G1',
        totalWeight: 20.0,
        items: [{ id: '1', name: 'Movie', price: 300.0, quantity: 1, weight: 10.0 }],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.errors).toBeUndefined();
    expect(res.body.rates.length).toBeGreaterThan(0);
  });

  test('shippingrates.fetch returns a customer-facing error as a 2XX', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart/shipping-rates', {
      eventName: 'shippingrates.fetch',
      mode: 'Test',
      createdOn: '2026-09-28T14:40:00.000Z',
      content: { ...ORDER_COMPLETED.content, shippingAddress: {} },
    });

    expect(res.status).toBe(200);
    expect(res.body.errors[0].key).toBe('invalid_shipping_address');
    expect(res.body.rates).toBeUndefined();
  });

  test('taxes.calculate returns a taxes array in currency units', async () => {
    mockValidation(200);
    const res = await post('/webhooks/snipcart/taxes', {
      eventName: 'taxes.calculate',
      mode: 'Test',
      createdOn: '2026-09-28T14:45:00.000Z',
      content: {
        token: 'cart-token',
        currency: 'usd',
        items: [{ totalPrice: 100 }, { totalPrice: 50 }],
      },
    });

    expect(res.status).toBe(200);
    expect(res.body.taxes).toEqual([
      expect.objectContaining({ name: 'Sales tax', amount: 7.5, rate: 0.05 }),
    ]);
  });

  test('the synchronous webhooks validate the token too', async () => {
    mockValidation(404);
    const res = await post('/webhooks/snipcart/taxes', {
      eventName: 'taxes.calculate',
      mode: 'Test',
      createdOn: '2026-09-28T14:45:00.000Z',
      content: { items: [] },
    });

    expect(res.status).toBe(401);
  });
});
