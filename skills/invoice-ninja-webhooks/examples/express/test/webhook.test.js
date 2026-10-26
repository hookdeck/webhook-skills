const request = require('supertest');

// Set test environment variables before importing the app
process.env.INVOICE_NINJA_WEBHOOK_HEADER = 'X-Webhook-Secret';
process.env.INVOICE_NINJA_WEBHOOK_SECRET = 'test_invoice_ninja_secret_0123456789';

const app = require('../src/index');
const { verifyInvoiceNinjaRequest, detectEntity } = require('../src/index');

const HEADER = process.env.INVOICE_NINJA_WEBHOOK_HEADER;
const SECRET = process.env.INVOICE_NINJA_WEBHOOK_SECRET;
const URL = '/webhooks/invoice-ninja';

const INVOICE = { id: 'Opnel5aKBz', number: '0001', client_id: 'Wpmbk5ezJn', amount: 100, balance: 100, line_items: [{ product_key: 'x', cost: 100, quantity: 1 }] };
const PAYMENT = { id: 'AS3df3A', number: '0002', client_id: 'Wpmbk5ezJn', amount: 100, applied: 100, transaction_reference: 'abc' };
const CLIENT = { id: 'Wpmbk5ezJn', name: 'Acme', contacts: [{ id: 'c1', email: 'a@example.com' }] };

function send(method, { headers = { [HEADER]: SECRET }, body = JSON.stringify(INVOICE), contentType = 'application/json', query = '' } = {}) {
  let req = request(app)[method](URL + query).set(headers);
  if (body !== undefined) req = req.set('Content-Type', contentType).send(body);
  return req;
}

describe('Invoice Ninja webhook endpoint', () => {
  describe('secret header verification', () => {
    it('accepts the correct header value', async () => {
      const res = await send('post');
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it('matches the header name case-insensitively', async () => {
      const res = await send('post', { headers: { 'x-webhook-secret': SECRET } });
      expect(res.status).toBe(200);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await send('post', { headers: { [HEADER]: 'x'.repeat(SECRET.length) } });
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await send('post', { headers: { [HEADER]: 'short' } });
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await send('post', { headers: {} });
      expect(res.status).toBe(401);
    });

    it('rejects the secret sent under a different header name', async () => {
      const res = await send('post', { headers: { 'X-Other': SECRET } });
      expect(res.status).toBe(401);
    });

    it('never answers 404, 405 or 410 for bad credentials', async () => {
      for (const method of ['post', 'put']) {
        const res = await send(method, { headers: {} });
        expect([404, 405, 410]).not.toContain(res.status);
        expect(res.status).toBe(401);
      }
    });
  });

  describe('request methods', () => {
    it.each(['post', 'put'])('accepts %s with a JSON body', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true });
    });

    it.each(['patch', 'get'])('answers 400 for %s (rest_method is only post or put)', async (method) => {
      const res = await send(method);
      expect(res.status).toBe(400);
    });

    it('accepts an empty POST body', async () => {
      const res = await send('post', { body: '' });
      expect(res.status).toBe(200);
    });

    it('answers 400 (not 405) for a method it does not handle', async () => {
      const res = await request(app).delete(URL).set(HEADER, SECRET);
      expect(res.status).toBe(400);
    });
  });

  describe('body handling', () => {
    it('accepts a JSON body with any content type', async () => {
      const res = await send('post', { contentType: 'text/plain' });
      expect(res.status).toBe(200);
    });

    it('returns 400 for invalid JSON', async () => {
      const res = await send('post', { body: 'not json' });
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array', async () => {
      const res = await send('post', { body: '[1,2]' });
      expect(res.status).toBe(400);
    });

    it('does not parse the body when the credential is wrong', async () => {
      const res = await send('post', { headers: {}, body: 'not json' });
      expect(res.status).toBe(401);
    });
  });

  describe('routing', () => {
    let log;
    beforeEach(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
    afterEach(() => log.mockRestore());

    it.each([
      ['create_invoice', INVOICE, 'Invoice created'],
      ['create_payment', PAYMENT, 'Payment created'],
      ['update_client', CLIENT, 'Client updated'],
    ])('routes ?event=%s by URL', async (event, body, expected) => {
      const res = await send('post', { body: JSON.stringify(body), query: `?event=${event}` });
      expect(res.status).toBe(200);
      expect(log).toHaveBeenCalledWith(expect.stringContaining(expected));
    });

    it('falls back to entity shape when there is no event in the URL', async () => {
      await send('post', { body: JSON.stringify(PAYMENT) });
      expect(log).toHaveBeenCalledWith(expect.stringContaining('Payment received'));
    });

    it('detects entity shapes', () => {
      expect(detectEntity(INVOICE)).toBe('document');
      expect(detectEntity(PAYMENT)).toBe('payment');
      expect(detectEntity(CLIENT)).toBe('client');
      expect(detectEntity({})).toBe('unknown');
    });
  });

  describe('verifyInvoiceNinjaRequest', () => {
    it('compares the whole value including a Bearer prefix', () => {
      const headers = { authorization: 'Bearer abc123' };
      expect(verifyInvoiceNinjaRequest(headers, 'Bearer abc123', 'Authorization')).toBe(true);
      expect(verifyInvoiceNinjaRequest({ authorization: 'abc123' }, 'Bearer abc123', 'Authorization')).toBe(false);
      expect(verifyInvoiceNinjaRequest(headers, 'abc123', 'Authorization')).toBe(false);
    });

    it('rejects everything when no secret is configured', () => {
      expect(verifyInvoiceNinjaRequest({ authorization: 'x' }, '', 'Authorization')).toBe(false);
      expect(verifyInvoiceNinjaRequest({ authorization: 'undefined' }, undefined, 'Authorization')).toBe(false);
    });

    it('defaults the header name to Authorization', () => {
      const saved = process.env.INVOICE_NINJA_WEBHOOK_HEADER;
      delete process.env.INVOICE_NINJA_WEBHOOK_HEADER;
      try {
        expect(verifyInvoiceNinjaRequest({ authorization: 'tok' }, 'tok')).toBe(true);
      } finally {
        process.env.INVOICE_NINJA_WEBHOOK_HEADER = saved;
      }
    });
  });
});
