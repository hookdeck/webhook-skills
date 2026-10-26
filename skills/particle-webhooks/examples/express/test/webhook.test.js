const request = require('supertest');

// Set test environment variables before importing the app
process.env.PARTICLE_WEBHOOK_SECRET = 'Bearer test_particle_secret_0123456789';
delete process.env.PARTICLE_WEBHOOK_HEADER;

const app = require('../src/index');
const { verifyParticleRequest } = require('../src/index');

const SECRET = process.env.PARTICLE_WEBHOOK_SECRET;
const FORM = 'event=temperature&data=21.5&published_at=2017-02-01T21%3A08%3A05.763Z&coreid=3f002b000000000000000000';
const JSON_BODY = JSON.stringify({
  event: 'motion-detected',
  data: '1',
  published_at: '2017-02-01T21:08:05.763Z',
  coreid: '3f002b000000000000000000',
});

afterEach(() => {
  delete process.env.PARTICLE_WEBHOOK_HEADER;
  process.env.PARTICLE_WEBHOOK_SECRET = SECRET;
});

describe('Particle webhook endpoint', () => {
  describe('header authentication', () => {
    it('accepts the correct header value (default Authorization header)', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .type('form')
        .send(FORM);
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ received: true, event: 'temperature' });
    });

    it('compares the whole value: the bare token without "Bearer " is rejected', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET.replace('Bearer ', ''))
        .type('form')
        .send(FORM);
      expect(res.status).toBe(401);
    });

    it('rejects a wrong value of the same length', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', 'x'.repeat(SECRET.length))
        .type('form')
        .send(FORM);
      expect(res.status).toBe(401);
    });

    it('rejects a value of a different length without throwing', async () => {
      const res = await request(app).post('/webhooks/particle').set('Authorization', 'short').send(FORM);
      expect(res.status).toBe(401);
    });

    it('rejects a missing header', async () => {
      const res = await request(app).post('/webhooks/particle').type('form').send(FORM);
      expect(res.status).toBe(401);
    });

    it('rejects everything when the secret is not configured', async () => {
      delete process.env.PARTICLE_WEBHOOK_SECRET;
      const res = await request(app).post('/webhooks/particle').set('Authorization', '').send(FORM);
      expect(res.status).toBe(401);
    });

    it('reads a custom header name case-insensitively', async () => {
      process.env.PARTICLE_WEBHOOK_HEADER = 'X-Particle-Token';
      process.env.PARTICLE_WEBHOOK_SECRET = 'abc123-static-secret';
      const ok = await request(app)
        .post('/webhooks/particle')
        .set('x-particle-token', 'abc123-static-secret')
        .type('form')
        .send(FORM);
      expect(ok.status).toBe(200);

      const wrongHeader = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', 'abc123-static-secret')
        .type('form')
        .send(FORM);
      expect(wrongHeader.status).toBe(401);
    });

    it('does not parse the body when authentication fails', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Content-Type', 'application/json')
        .send('{not json');
      expect(res.status).toBe(401);
    });

    it('verifyParticleRequest handles non-ASCII values without throwing', () => {
      expect(verifyParticleRequest({ authorization: 'café' }, 'café')).toBe(false); // latin1 vs utf8 bytes differ
      expect(verifyParticleRequest({ authorization: 'Bearer a' }, 'Bearer a')).toBe(true);
    });
  });

  describe('methods', () => {
    it.each(['post', 'put', 'patch', 'delete', 'get'])('accepts %s with a valid header', async (method) => {
      const res = await request(app)[method]('/webhooks/particle?event=temperature&data=20').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('temperature');
    });

    it.each(['post', 'put', 'patch', 'delete', 'get'])('checks the header first on %s', async (method) => {
      const res = await request(app)[method]('/webhooks/particle?event=temperature');
      expect(res.status).toBe(401);
    });
  });

  describe('body parsing', () => {
    it('parses the default form-encoded body', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send(FORM);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('temperature');
    });

    it('parses a JSON body', async () => {
      const res = await request(app)
        .put('/webhooks/particle')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send(JSON_BODY);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('motion-detected');
    });

    it('parses query-string data on GET', async () => {
      const res = await request(app)
        .get('/webhooks/particle?event=motion-detected&coreid=abc')
        .set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('motion-detected');
    });

    it('accepts an empty body', async () => {
      const res = await request(app).delete('/webhooks/particle').set('Authorization', SECRET);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('unhandled');
    });

    it('accepts a JSON body under an unusual content type', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .set('Content-Type', 'text/plain')
        .send(JSON_BODY);
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('motion-detected');
    });

    it('returns 400 for malformed JSON after authentication', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send('{not json');
      expect(res.status).toBe(400);
    });

    it('returns 400 for a JSON array body', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .set('Content-Type', 'application/json')
        .send('[1,2]');
      expect(res.status).toBe(400);
    });

    it('acknowledges unknown events', async () => {
      const res = await request(app)
        .post('/webhooks/particle')
        .set('Authorization', SECRET)
        .type('form')
        .send('event=something-else&data=1');
      expect(res.status).toBe(200);
      expect(res.body.event).toBe('unhandled');
    });
  });

  it('serves /health', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
  });
});
