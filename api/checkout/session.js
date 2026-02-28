import crypto from 'node:crypto';
import { issuePatientToken } from '../../backend/lib/auth.js';
import { calculateRisk } from '../../backend/lib/risk.js';
import { appendAudit, createCertificate, updateCertificate } from '../../backend/lib/storage.js';
import { error, info } from '../../backend/lib/logger.js';

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 1121);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2711);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1917);

function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function isStripeEnabled() {
  return Boolean(STRIPE_SECRET_KEY);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeNameForStripe(value) {
  return String(value || '').trim().slice(0, 120);
}

function buildDraftCertificate(requestBody) {
  const patient = requestBody.patient || {};
  const consult = requestBody.consult || {};
  const parsedStartDate = consult.startDate ? new Date(consult.startDate) : new Date();
  const startDate = Number.isNaN(parsedStartDate.getTime()) ? new Date() : parsedStartDate;

  return {
    fullName: patient.fullName || '',
    dob: patient.dob || '',
    email: patient.email || '',
    phone: patient.phone || '',
    address: patient.address || '',
    purpose: consult.purpose || '',
    symptom: consult.symptom || '',
    description: consult.description || '',
    startDate: startDate.toISOString().split('T')[0],
    durationDays: Number(consult.durationDays || 1),
  };
}

function stripePricingFromRequest(body) {
  const isUnlimited = Boolean(body?.consult?.isUnlimited);
  const durationDays = Math.max(1, Number(body?.consult?.durationDays || 1));

  if (isUnlimited) {
    return {
      mode: 'subscription',
      unitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING,
      displayName: 'Onyahealth Pro',
      description: 'Recurring medical certificate support',
      recurringInterval: 'day',
      recurringIntervalCount: 26,
    };
  }

  if (durationDays <= 1) {
    return {
      mode: 'payment',
      unitAmount: STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_SINGLE_DAY,
      displayName: 'Medical Consultation (Single day)',
      description: 'One-day medical certificate request',
    };
  }

  return {
    mode: 'payment',
    unitAmount: STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS,
    productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF,
    displayName: 'Medical Consultation (Multi-day)',
    description: 'Multi-day medical certificate request',
  };
}

function inferFrontendBaseUrl(req) {
  const configured = String(process.env.FRONTEND_BASE_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  const host = String(req.headers.host || '');
  if (!host) return 'http://localhost:5173';
  return `${protocol}://${host}`;
}

async function createStripeCheckoutSession({ req, certificate, pricing }) {
  const frontendBase = inferFrontendBaseUrl(req);
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  params.set('success_url', `${frontendBase}/patient?checkout=success`);
  params.set('cancel_url', `${frontendBase}/doctor?checkout=cancelled`);
  params.set('client_reference_id', certificate.id);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'aud');
  params.set('line_items[0][price_data][unit_amount]', String(pricing.unitAmount));
  params.set('line_items[0][price_data][product]', pricing.productId);
  params.set('line_items[0][price_data][product_data][name]', pricing.displayName);
  params.set('line_items[0][price_data][product_data][description]', pricing.description);
  params.set('metadata[certificate_id]', certificate.id);
  params.set('metadata[patient_email]', certificate.certificateDraft.email || '');
  params.set('metadata[service_type]', certificate.serviceType || 'doctor');
  params.set('metadata[patient_name]', sanitizeNameForStripe(certificate.certificateDraft.fullName));
  params.set('allow_promotion_codes', 'true');

  if (pricing.mode === 'subscription') {
    params.set('line_items[0][price_data][recurring][interval]', pricing.recurringInterval);
    params.set('line_items[0][price_data][recurring][interval_count]', String(pricing.recurringIntervalCount));
    params.set('subscription_data[metadata][certificate_id]', certificate.id);
    params.set('subscription_data[metadata][patient_email]', certificate.certificateDraft.email || '');
  }

  const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Stripe session create failed (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
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
    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe is not configured on the server' });
      return;
    }

    const body = await parseJsonBody(req);
    const patient = body?.patient || {};

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const certificate = {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      status: 'awaiting_payment',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: {
        ...body,
        payment: {
          provider: 'stripe',
          status: 'initiated',
        },
      },
      decision: null,
    };

    await createCertificate(certificate);
    const pricing = stripePricingFromRequest(body);
    const session = await createStripeCheckoutSession({ req, certificate, pricing });

    await updateCertificate(certificate.id, (current) => ({
      ...current,
      rawSubmission: {
        ...(current.rawSubmission || {}),
        payment: {
          ...(current.rawSubmission?.payment || {}),
          stripeSessionId: session.id || null,
          checkoutUrl: session.url || null,
          amount: pricing.unitAmount,
          currency: 'aud',
          mode: pricing.mode,
        },
      },
    }));

    await appendAudit({
      type: 'CHECKOUT_SESSION_CREATED',
      certificateId: certificate.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      amount: pricing.unitAmount,
      mode: pricing.mode,
    });

    const patientToken = issuePatientToken(normalizeEmail(patient.email));

    info('checkout.session.created', {
      certificateId: certificate.id,
      stripeSessionId: session.id || null,
      mode: pricing.mode,
      amount: pricing.unitAmount,
    });

    sendJson(res, 200, {
      certificateId: certificate.id,
      checkoutUrl: session.url,
      sessionId: session.id,
      patientToken,
    });
  } catch (err) {
    error('checkout.session.failed', {
      message: err?.message || String(err),
      status: err?.status || null,
      data: err?.data || null,
    });
    sendJson(res, 500, { error: err?.message || 'Unable to create checkout session' });
  }
}
