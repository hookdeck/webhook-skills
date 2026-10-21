const request = require('supertest');

const TOKEN = 'zi_test_token_0123456789abcdef';
process.env.PORT = '0';

const { app, server, verifyZoomInfoToken } = require('../src/index');

const payload = JSON.stringify({ data: [{ id: 1, email: 'a@example.com' }] });

describe('ZoomInfo webhook (Express)', () => {
  beforeEach(() => {
    process.env.ZOOMINFO_WEBHOOK_TOKEN = TOKEN;
  });

  afterAll((done) => {
    server.close(done);
  });

  it('accepts a request with the correct x-zoominfo-token', async () => {
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .set('x-zoominfo-token', TOKEN)
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, verified: true });
  });

  it('rejects a wrong token', async () => {
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .set('x-zoominfo-token', 'wrong')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('rejects a token of a different length without throwing', async () => {
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .set('x-zoominfo-token', TOKEN + 'x')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('rejects a missing token header', async () => {
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(401);
  });

  it('returns 400 for a valid token with invalid JSON', async () => {
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .set('x-zoominfo-token', TOKEN)
      .send('not json');
    expect(res.status).toBe(400);
  });

  it('acknowledges the Validate sample without processing when no token is configured', async () => {
    delete process.env.ZOOMINFO_WEBHOOK_TOKEN;
    const res = await request(app)
      .post('/webhooks/zoominfo')
      .set('Content-Type', 'application/json')
      .send(payload);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, verified: false });
  });

  it('verifyZoomInfoToken compares in a length-safe way', () => {
    expect(verifyZoomInfoToken(TOKEN, TOKEN)).toBe(true);
    expect(verifyZoomInfoToken('short', TOKEN)).toBe(false);
    expect(verifyZoomInfoToken(undefined, TOKEN)).toBe(false);
    expect(verifyZoomInfoToken(TOKEN, undefined)).toBe(false);
  });
});
