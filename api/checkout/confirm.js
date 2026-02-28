import { markCertificatePaidFromStripeSession } from '../_lib/reviewWorkflow.js';

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);
  return {};
}

function getSessionId(req, body) {
  const queryId = req.query?.session_id;
  if (typeof queryId === 'string' && queryId.trim()) return queryId.trim();
  if (Array.isArray(queryId) && queryId[0]) return String(queryId[0]).trim();
  const bodyId = body?.sessionId || body?.session_id;
  if (bodyId) return String(bodyId).trim();
  return '';
}

async function fetchStripeSession(sessionId) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe secret key is not configured');
  }
  const response = await fetch(`https://api.stripe.com/v1/checkout/sessions/${encodeURIComponent(sessionId)}`, {
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
    const message = payload?.error?.message || `Unable to load Stripe session (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    throw err;
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
    const body = await parseJsonBody(req);
    const sessionId = getSessionId(req, body);
    if (!sessionId) {
      sendJson(res, 400, { error: 'session_id is required' });
      return;
    }

    const session = await fetchStripeSession(sessionId);
    const paymentStatus = String(session?.payment_status || '').toLowerCase();
    if (!['paid', 'no_payment_required'].includes(paymentStatus)) {
      sendJson(res, 409, {
        error: 'Payment is not completed yet',
        paymentStatus: session?.payment_status || null,
      });
      return;
    }

    const result = await markCertificatePaidFromStripeSession(session, 'checkout_success_confirm');
    sendJson(res, 200, {
      ok: true,
      sessionId,
      paymentStatus: session?.payment_status || null,
      certificateId: result?.certificateId || null,
      status: result?.status || null,
      updated: Boolean(result?.updated),
    });
  } catch (err) {
    sendJson(res, err?.status || 500, { error: err?.message || 'Unable to confirm checkout' });
  }
}
