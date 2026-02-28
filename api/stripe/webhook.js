import crypto from 'node:crypto';
import { error, info } from '../../backend/lib/logger.js';
import { markCertificatePaidFromStripeSession } from '../_lib/reviewWorkflow.js';

const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

async function parseRawBody(req) {
  if (req.rawBody) {
    return Buffer.isBuffer(req.rawBody) ? req.rawBody : Buffer.from(req.rawBody);
  }

  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }

  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  if (req.body && typeof req.body === 'object') {
    throw new Error('Raw request body unavailable for Stripe signature verification');
  }

  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    const normalized = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += normalized.length;
    if (total > 2_000_000) {
      throw new Error('Request body too large');
    }
    chunks.push(normalized);
  }
  return Buffer.concat(chunks);
}

function verifyStripeEvent(rawBodyBuffer, signatureHeader) {
  if (!STRIPE_WEBHOOK_SECRET) {
    throw new Error('Stripe webhook secret is not configured');
  }

  const rawBody = rawBodyBuffer.toString('utf8');
  const parts = String(signatureHeader || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const timestampPart = parts.find((part) => part.startsWith('t='));
  const signatures = parts.filter((part) => part.startsWith('v1=')).map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) {
    throw new Error('Missing Stripe signature components');
  }

  const timestamp = timestampPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto.createHmac('sha256', STRIPE_WEBHOOK_SECRET).update(signedPayload).digest('hex');
  const valid = signatures.some((signature) => safeTimingCompare(signature, expected));
  if (!valid) {
    throw new Error('Invalid Stripe signature');
  }

  return JSON.parse(rawBody);
}

async function fetchStripeEvent(eventId) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured');
  }
  const response = await fetch(`https://api.stripe.com/v1/events/${encodeURIComponent(eventId)}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(payload?.error?.message || `Unable to verify Stripe event (${response.status})`);
  }

  return payload;
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const signature = req.headers['stripe-signature'];
    let event = null;

    try {
      const rawBody = await parseRawBody(req);
      event = verifyStripeEvent(rawBody, signature);
    } catch (signatureError) {
      // Fallback: if middleware transformed the body, verify by fetching the event from Stripe.
      const parsedBody = req.body && typeof req.body === 'object' ? req.body : null;
      const eventId = parsedBody?.id;
      if (!eventId) {
        throw signatureError;
      }
      event = await fetchStripeEvent(eventId);
      info('stripe.webhook.signature_fallback', {
        eventId,
        message: signatureError?.message || String(signatureError),
      });
    }

    if (event?.type === 'checkout.session.completed') {
      const session = event?.data?.object || {};
      await markCertificatePaidFromStripeSession(session, 'stripe_webhook');
    }

    sendJson(res, 200, { received: true });
  } catch (err) {
    error('stripe.webhook.failed', {
      message: err?.message || String(err),
    });
    sendJson(res, 400, { error: err?.message || 'Invalid Stripe webhook' });
  }
}
