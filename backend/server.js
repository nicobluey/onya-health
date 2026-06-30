import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import {
  issueDoctorToken,
  issuePatientToken,
  validateDoctorCredentials,
  verifyDoctorToken,
  verifyPatientToken,
} from './lib/auth.js';
import {
  authenticatePatientAccount,
  createPatientAccount,
  getPatientAccountByEmail,
  isLikelyEmail as isLikelyPatientEmail,
  issuePasswordResetToken,
  resetPasswordWithToken,
  updatePatientAccountProfile,
} from './lib/patient-auth.js';
import {
  authenticateDoctorAccount,
  createDoctorAccount,
  getDoctorAccountByEmail,
  isDoctorAccountApproved,
  isLikelyEmail as isLikelyDoctorEmail,
  issueDoctorPasswordResetToken,
  listDoctorEmails,
  resetDoctorPasswordWithToken,
  setDoctorAccountApprovalStatus,
  upsertDoctorAccount,
} from './lib/doctor-auth.js';
import { calculateRisk } from './lib/risk.js';
import { buildCertificatePdf } from './lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from './lib/notes.js';
import {
  appendAudit,
  createCertificate,
  getCertificateById,
  getMealPlanGenerationCache,
  getLatestMealPlanGenerationCacheByPatientEmail,
  getMealPlanTemplateCacheByIntakeHash,
  getPatientBillingByEmail,
  isSupabaseStorageEnabled,
  listMealPlannerRecipes,
  listMealPlanGenerationCacheByPatientEmail,
  listMealPlannerRecipesByIds,
  listCertificates,
  upsertMealPlanGenerationCache,
  upsertMealPlannerRecipes,
  upsertPatientBillingByEmail,
  updateCertificate,
} from './lib/storage.js';
import { sendEmail } from './lib/email.js';
import {
  renderDoctorPatientMessageEmail,
  renderDoctorPasswordResetEmail,
  renderDoctorReviewEmail,
  renderDoctorWelcomeEmail,
  renderPatientCertificateDeniedEmail,
  renderPatientCertificateReadyEmail,
  renderPatientMoreInfoEmail,
  renderPatientPasswordResetEmail,
  renderPatientWelcomeEmail,
} from './lib/email-templates.js';
import { error, info } from './lib/logger.js';

function loadEnvFile(filePath) {
  if (!fsSync.existsSync(filePath)) return;
  const envText = fsSync.readFileSync(filePath, 'utf8');
  for (const line of envText.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    if (typeof process.env[key] === 'undefined') {
      process.env[key] = value;
    }
  }
}

loadEnvFile(path.resolve(process.cwd(), '.env'));
loadEnvFile(path.resolve(process.cwd(), 'backend', '.env'));

const PORT = Number(process.env.PORT || 8787);
const APP_BASE_URL = String(process.env.APP_BASE_URL || `http://localhost:${PORT}`)
  .trim()
  .replace(/\/$/, '');
const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '*').trim();
const FRONTEND_BASE_URL = String(process.env.FRONTEND_BASE_URL || '')
  .trim()
  .replace(/\/$/, '');
const MEAL_PLAN_FEATURE_ENABLED = ['1', 'true', 'yes'].includes(
  String(process.env.ENABLE_MEAL_PLAN_FEATURE || '').trim().toLowerCase()
);
const DOCTOR_NOTIFICATION_EMAILS_CONFIGURED = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);
const ADMIN_DOCTOR_EMAILS = new Set(
  [
    process.env.ADMIN_DOCTOR_EMAILS || '',
    process.env.DOCTOR_LOGIN_EMAIL || 'doctor@onyahealth.com',
  ]
    .join(',')
    .split(',')
    .map((item) => normalizeEmail(item))
    .filter(Boolean)
);
const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING = process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';
const CERTIFICATE_TIME_ZONE = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 971);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2971);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1900);
const STRIPE_MULTI_DAY_MIN_DAYS = Math.max(
  2,
  Number(process.env.STRIPE_MULTI_DAY_MIN_DAYS || 2)
);
const configuredCarerCertificateAmountCents = Number(process.env.STRIPE_AMOUNT_CARER_CERT_AUD_CENTS || '');
const STRIPE_AMOUNT_CARER_CERT_AUD_CENTS =
  Number.isFinite(configuredCarerCertificateAmountCents) &&
  configuredCarerCertificateAmountCents > 0 &&
  configuredCarerCertificateAmountCents < STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS
    ? configuredCarerCertificateAmountCents
    : 495;
const STRIPE_SUBSCRIPTION_CACHE_TTL_MS = Math.max(
  15_000,
  Number(process.env.STRIPE_SUBSCRIPTION_CACHE_TTL_MS || 60_000)
);
const STRIPE_BILLING_PORTAL_RETURN_PATH = String(
  process.env.STRIPE_BILLING_PORTAL_RETURN_PATH || '/patient'
).trim();
const PATIENT_PASSWORD_RESET_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.PATIENT_PASSWORD_RESET_TTL_MS || 1000 * 60 * 60)
);
const PATIENT_PASSWORD_RESET_PATH = process.env.PATIENT_PASSWORD_RESET_PATH || '/patient/reset-password';
const DOCTOR_PASSWORD_RESET_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.DOCTOR_PASSWORD_RESET_TTL_MS || 1000 * 60 * 60)
);
const DOCTOR_PASSWORD_RESET_PATH = process.env.DOCTOR_PASSWORD_RESET_PATH || '/doctor/login';
const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);
const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const LOCAL_FALLBACK_RECIPE_CATALOG_PATH = path.resolve(
  process.cwd(),
  'frontend',
  'public',
  'weight-loss-reset-recipes.json'
);

const stripeSubscriptionCache = new Map();
let mealPlanAiModulePromise = null;

function loadMealPlanAiModule() {
  if (!mealPlanAiModulePromise) {
    mealPlanAiModulePromise = import('./lib/meal-plan-ai.js');
  }
  return mealPlanAiModulePromise;
}

const PORTAL_DIR = path.resolve(process.cwd(), 'backend', 'doctor-portal');

function normalizeOrigin(value) {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'null') return '';
  if (raw === '*') return '*';

  const candidate = raw.includes('://') ? raw : `https://${raw}`;
  try {
    return new URL(candidate).origin;
  } catch {
    return '';
  }
}

function parseCorsOrigins(value) {
  const raw = String(value || '').trim();
  if (!raw) return [];
  const tokens = raw
    .split(/[,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (tokens.includes('*')) return ['*'];

  const origins = [];
  for (const token of tokens) {
    const origin = normalizeOrigin(token);
    if (origin && !origins.includes(origin)) {
      origins.push(origin);
    }
  }
  return origins;
}

function buildAllowedCorsOrigins() {
  const configuredOrigins = parseCorsOrigins(CORS_ORIGIN);
  if (configuredOrigins.includes('*')) return ['*'];

  const derivedOrigins = [
    ...configuredOrigins,
    normalizeOrigin(FRONTEND_BASE_URL),
    normalizeOrigin(APP_BASE_URL),
    normalizeOrigin(process.env.VERCEL_URL),
    normalizeOrigin(process.env.VERCEL_PROJECT_PRODUCTION_URL),
  ].filter(Boolean);

  return Array.from(new Set(derivedOrigins));
}

const ALLOWED_CORS_ORIGINS = buildAllowedCorsOrigins();
const DEFAULT_CORS_ORIGIN = ALLOWED_CORS_ORIGINS[0] || '';

function appendVaryHeader(res, headerName) {
  const existingValue = String(res.getHeader('Vary') || '');
  const parts = existingValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (!parts.includes(headerName)) {
    parts.push(headerName);
    res.setHeader('Vary', parts.join(', '));
  }
}

function resolveCorsOrigin(req, res) {
  if (ALLOWED_CORS_ORIGINS.includes('*')) return '*';

  const request = req || res?.req;
  const requestOrigin = normalizeOrigin(request?.headers?.origin || '');
  if (requestOrigin && ALLOWED_CORS_ORIGINS.includes(requestOrigin)) {
    return requestOrigin;
  }

  if (requestOrigin) return '';
  return DEFAULT_CORS_ORIGIN;
}

function setCors(res, req) {
  const existingOrigin = normalizeOrigin(res.getHeader('Access-Control-Allow-Origin') || '');
  const allowedOrigin = req ? resolveCorsOrigin(req, res) : existingOrigin || resolveCorsOrigin(req, res);
  if (allowedOrigin) {
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
  } else {
    res.removeHeader('Access-Control-Allow-Origin');
  }
  if (allowedOrigin && allowedOrigin !== '*') {
    appendVaryHeader(res, 'Origin');
  }
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Stripe-Signature');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
}

function sendJson(res, statusCode, payload) {
  setCors(res);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(body);
}

async function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk.toString('utf8');
      if (raw.length > 2_000_000) {
        reject(new Error('Request body too large'));
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error('Invalid JSON body'));
      }
    });
    req.on('error', reject);
  });
}

async function parseRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (chunk) => {
      total += chunk.length;
      if (total > 2_000_000) {
        reject(new Error('Request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
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
  const signatures = parts
    .filter((part) => part.startsWith('v1='))
    .map((part) => part.slice(3));

  if (!timestampPart || signatures.length === 0) {
    throw new Error('Missing Stripe signature components');
  }

  const timestamp = timestampPart.slice(2);
  const signedPayload = `${timestamp}.${rawBody}`;
  const expected = crypto
    .createHmac('sha256', STRIPE_WEBHOOK_SECRET)
    .update(signedPayload)
    .digest('hex');

  const valid = signatures.some((signature) => safeTimingCompare(signature, expected));
  if (!valid) {
    throw new Error('Invalid Stripe signature');
  }

  return JSON.parse(rawBody);
}

function sanitizeNameForStripe(value) {
  return String(value || '').trim().slice(0, 120);
}

function stripePricingFromRequest(body) {
  const isUnlimited = Boolean(body?.consult?.isUnlimited);
  const durationDays = Math.min(7, Math.max(1, Number(body?.consult?.durationDays || 1)));
  const includeCarerCertificate = !isUnlimited && Boolean(body?.consult?.includeCarerCertificate);
  const carerCertificateAmount = includeCarerCertificate ? STRIPE_AMOUNT_CARER_CERT_AUD_CENTS : 0;

  if (isUnlimited) {
    return {
      mode: 'subscription',
      baseUnitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      carerCertificateAmount: 0,
      includeCarerCertificate: false,
      unitAmount: STRIPE_AMOUNT_RECURRING_AUD_CENTS,
      productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING,
      displayName: 'Onyahealth Pro',
      description: 'Recurring medical certificate support',
      recurringInterval: 'day',
      recurringIntervalCount: 26,
    };
  }

  if (durationDays < STRIPE_MULTI_DAY_MIN_DAYS) {
    const baseUnitAmount = STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS;
    return {
      mode: 'payment',
      baseUnitAmount,
      carerCertificateAmount,
      includeCarerCertificate,
      unitAmount: baseUnitAmount + carerCertificateAmount,
      productId: STRIPE_PRICE_PRODUCT_SINGLE_DAY,
      displayName: `Medical Consultation (${STRIPE_MULTI_DAY_MIN_DAYS - 1} days or less)`,
      description: `Medical certificate request for ${STRIPE_MULTI_DAY_MIN_DAYS - 1} days or less`,
    };
  }

  const linearRangeDays = 5 - 1;
  const cappedDuration = Math.min(durationDays, 5);
  const baseUnitAmount =
    linearRangeDays <= 0
      ? STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS
      : STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS +
        Math.round(((cappedDuration - 1) * (STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS - STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS)) / linearRangeDays);
  return {
    mode: 'payment',
    baseUnitAmount,
    carerCertificateAmount,
    includeCarerCertificate,
    unitAmount: baseUnitAmount + carerCertificateAmount,
    productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF,
    displayName: `Medical Consultation (${STRIPE_MULTI_DAY_MIN_DAYS}+ days)`,
    description: `Medical certificate request for ${STRIPE_MULTI_DAY_MIN_DAYS}+ days`,
  };
}

async function createStripeCheckoutSession({ certificate, pricing, uiMode = 'hosted' }) {
  const frontendBase = getFrontendBaseUrl();
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  if (uiMode === 'embedded') {
    params.set('ui_mode', 'embedded');
    params.set(
      'return_url',
      `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.set('redirect_on_completion', 'if_required');
  } else {
    params.set(
      'success_url',
      `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.set('cancel_url', `${frontendBase}/doctor?checkout=cancelled`);
  }
  params.set('client_reference_id', certificate.id);
  params.set('payment_method_types[0]', 'card');
  params.set('line_items[0][quantity]', '1');
  params.set('line_items[0][price_data][currency]', 'aud');
  params.set('line_items[0][price_data][unit_amount]', String(pricing.unitAmount));
  params.set('line_items[0][price_data][product]', pricing.productId);
  params.set('metadata[certificate_id]', certificate.id);
  params.set('metadata[verification_code]', getCertificateVerificationCode(certificate));
  params.set('metadata[patient_email]', certificate.certificateDraft.email || '');
  params.set('metadata[service_type]', certificate.serviceType || 'doctor');
  params.set('metadata[patient_name]', sanitizeNameForStripe(certificate.certificateDraft.fullName));
  params.set('metadata[include_carer_certificate]', pricing.includeCarerCertificate ? 'true' : 'false');
  params.set('metadata[carer_certificate_amount]', String(pricing.carerCertificateAmount || 0));
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
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  return payload;
}

function formatDateInCertificateTimezone(value) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: CERTIFICATE_TIME_ZONE }).format(value);
}

function normalizeCertificateStartDate(value) {
  const todayDate = formatDateInCertificateTimezone(new Date());
  const rawDate = String(value || '').trim();
  const parsedDatePattern = rawDate.match(/\d{4}-\d{2}-\d{2}/);
  if (parsedDatePattern?.[0]) {
    return parsedDatePattern[0] < todayDate ? todayDate : parsedDatePattern[0];
  }

  const parsed = rawDate ? new Date(rawDate) : new Date();
  if (Number.isNaN(parsed.getTime())) return todayDate;

  const candidateDate = formatDateInCertificateTimezone(parsed);
  return candidateDate < todayDate ? todayDate : candidateDate;
}

function buildDraftCertificate(requestBody) {
  const patient = requestBody.patient || {};
  const consult = requestBody.consult || {};
  const startDate = normalizeCertificateStartDate(consult.startDate);
  const durationDays = Math.min(7, Math.max(1, Number(consult.durationDays || 1)));
  const isUnlimited = Boolean(consult.isUnlimited);
  const includeCarerCertificate = !isUnlimited && Boolean(consult.includeCarerCertificate);
  const carerCertificateDetails = includeCarerCertificate
    ? normalizeCarerCertificateDetails(consult.carerCertificateDetails || consult.carer || {})
    : null;
  const symptomVisibility = String(consult.symptomVisibility || '').trim().toLowerCase() === 'public'
    ? 'public'
    : 'private';

  return {
    fullName: patient.fullName || '',
    dob: patient.dob || '',
    email: patient.email || '',
    phone: patient.phone || '',
    address: patient.address || '',
    purpose: consult.purpose || '',
    symptom: consult.symptom || '',
    symptomVisibility,
    description: consult.description || '',
    startDate,
    durationDays,
    includeCarerCertificate,
    carerCertificateDetails,
  };
}

function normalizeCarerCertificateDetails(details) {
  const source = details && typeof details === 'object' ? details : {};
  return {
    fullName: String(source.fullName || source.name || '').trim(),
    dob: String(source.dob || source.dateOfBirth || '').trim(),
    relationship: String(source.relationship || source.caringContext || source.context || '').trim(),
    startDate: String(source.startDate || source.certificateStartDate || '').trim(),
    endDate: String(source.endDate || source.certificateEndDate || '').trim(),
    email: normalizeEmail(source.email || ''),
  };
}

function validateCarerCertificateDetails(details) {
  const errors = [];
  const normalized = normalizeCarerCertificateDetails(details);
  if (!normalized.fullName) errors.push('Carer full name is required');
  if (!normalized.dob) errors.push('Carer date of birth is required');
  if (!normalized.relationship) errors.push('Relationship or caring context is required');
  if (!normalized.startDate) errors.push('Carer certificate start date is required');
  if (!normalized.endDate) errors.push('Carer certificate end date is required');
  if (normalized.startDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.startDate)) {
    errors.push('Carer certificate start date must use YYYY-MM-DD');
  }
  if (normalized.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.endDate)) {
    errors.push('Carer certificate end date must use YYYY-MM-DD');
  }
  if (normalized.startDate && normalized.endDate && normalized.endDate < normalized.startDate) {
    errors.push('Carer certificate end date must be on or after the start date');
  }
  if (normalized.email && !isLikelyPatientEmail(normalized.email)) {
    errors.push('Carer email must be valid when supplied');
  }
  return { valid: errors.length === 0, errors, details: normalized };
}

function doctorPayloadFromRequest(cert) {
  return {
    id: cert.id,
    createdAt: cert.createdAt,
    status: cert.status,
    serviceType: cert.serviceType,
    patientName: cert.certificateDraft.fullName,
    patientEmail: cert.certificateDraft.email,
    purpose: cert.certificateDraft.purpose,
    symptom: cert.certificateDraft.symptom,
    symptomVisibility: cert.certificateDraft.symptomVisibility || 'private',
    startDate: cert.certificateDraft.startDate,
    durationDays: cert.certificateDraft.durationDays,
    verificationCode: getCertificateVerificationCode(cert),
    description: cert.certificateDraft.description,
    risk: cert.risk,
    decision: cert.decision || null,
  };
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function isStripePaymentPendingForCertificate(certificate) {
  const payment = certificate?.rawSubmission?.payment || null;
  if (!payment || typeof payment !== 'object') return false;
  if (String(payment.provider || '').trim().toLowerCase() !== 'stripe') return false;

  const paymentStatus = String(payment.status || '').trim().toLowerCase();
  const stripeSessionId = String(payment.stripeSessionId || '').trim();
  if (!paymentStatus) {
    return Boolean(stripeSessionId);
  }
  return !isPaidLikePaymentStatus(paymentStatus);
}

function isCertificateOpenForReview(certificate) {
  return isOpenForReview(certificate?.status) && !isStripePaymentPendingForCertificate(certificate);
}

function currentEmailProvider() {
  if (String(process.env.SMTP_HOST || '').trim() && String(process.env.SMTP_USER || '').trim() && String(process.env.SMTP_PASS || '').trim()) {
    return 'smtp';
  }
  return process.env.RESEND_API_KEY ? 'resend' : 'mock-outbox';
}

function isStripeEnabled() {
  return Boolean(STRIPE_SECRET_KEY);
}

function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

function getPatientAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyPatientToken(token);
}

async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  if (isDoctorAdminEmail(payload.email)) {
    return payload;
  }
  const profile = await resolveDoctorProfile(payload.email);
  if (!doctorProfileHasApproval(profile, payload.email)) {
    sendJson(res, 403, { error: 'Doctor account is pending admin approval.' });
    return null;
  }
  return payload;
}

async function requirePatient(req, res) {
  const payload = getPatientAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeProviderNumber(value) {
  return String(value || '').trim().toUpperCase();
}

function normalizeApprovalStatus(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['approved', 'pending', 'rejected'].includes(normalized) ? normalized : 'pending';
}

function isDoctorAdminEmail(email) {
  return ADMIN_DOCTOR_EMAILS.has(normalizeEmail(email));
}

function doctorProfileHasApproval(profile, email = '') {
  return isDoctorAdminEmail(email || profile?.email) || isDoctorAccountApproved(profile);
}

function normalizeCoreMealTypesForCache(value) {
  if (!Array.isArray(value)) return [];
  const normalized = [...new Set(
    value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter((entry) => entry === 'breakfast' || entry === 'lunch' || entry === 'dinner')
  )];
  const order = ['breakfast', 'lunch', 'dinner'];
  return order.filter((entry) => normalized.includes(entry));
}

function normalizeTextListForCache(value, { limit = 24 } = {}) {
  if (!Array.isArray(value)) return [];
  const normalized = [...new Set(
    value
      .map((entry) => String(entry || '').trim().toLowerCase())
      .filter(Boolean)
  )];
  normalized.sort((a, b) => a.localeCompare(b));
  return normalized.slice(0, limit);
}

function tokenizeFreeTextForCache(value) {
  return String(value || '')
    .split(/[,\n;|]/g)
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .slice(0, 24);
}

function clampNumberForCache(value, min, max, fallback) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
}

function normalizeStringForCache(value, limit = 160) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .slice(0, limit);
}

const COOKING_EQUIPMENT_ORDER = ['stovetop', 'oven', 'air fryer', 'microwave'];
const DEFAULT_COOKING_EQUIPMENT = ['stovetop', 'oven', 'microwave'];

function normalizeCookingEquipmentTokenForCache(value) {
  const normalized = normalizeStringForCache(value, 40).replace(/[_\s]+/g, ' ').trim();
  if (!normalized) return '';
  if (normalized === 'stovetop' || normalized === 'stove top' || normalized === 'stove' || normalized === 'hob') return 'stovetop';
  if (normalized === 'oven') return 'oven';
  if (normalized === 'air fryer' || normalized === 'airfryer') return 'air fryer';
  if (normalized === 'microwave' || normalized === 'microwave oven') return 'microwave';
  return '';
}

function normalizeCookingEquipmentListForCache(value) {
  const source = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,\n;|/]+/g)
      : [];
  const normalized = [...new Set(
    source
      .map((entry) => normalizeCookingEquipmentTokenForCache(entry))
      .filter(Boolean)
  )];
  return COOKING_EQUIPMENT_ORDER.filter((entry) => normalized.includes(entry));
}

function resolveAvailableEquipmentForCache(value) {
  const normalized = normalizeCookingEquipmentListForCache(value);
  return normalized.length > 0 ? normalized : [...DEFAULT_COOKING_EQUIPMENT];
}

function buildMealPlanCacheIdentity({ patientEmail, answers, includeSnack }) {
  const safeAnswers = answers && typeof answers === 'object' ? answers : {};
  const selectedMealTypes = normalizeCoreMealTypesForCache(safeAnswers.selectedMealTypes);
  const mealsPerDay =
    selectedMealTypes.length >= 2
      ? selectedMealTypes.length
      : Math.max(2, Math.min(3, Math.round(Number(safeAnswers.mealsPerDay || 3))));
  const normalized = {
    schemaVersion: 'ai_recipes_v4',
    includeSnack: Boolean(includeSnack),
    age: Math.round(clampNumberForCache(safeAnswers.age, 10, 99, 0)),
    gender: normalizeStringForCache(safeAnswers.gender, 32),
    heightCm: Math.round(clampNumberForCache(safeAnswers.heightCm, 100, 240, 0)),
    currentWeightKg: Math.round(clampNumberForCache(safeAnswers.currentWeightKg, 30, 260, 0) * 10) / 10,
    goalWeightKg: Math.round(clampNumberForCache(safeAnswers.goalWeightKg, 30, 260, 0) * 10) / 10,
    primaryHealthFocus: normalizeStringForCache(safeAnswers.primaryHealthFocus, 80),
    mainGoal: normalizeStringForCache(safeAnswers.mainGoal, 200),
    motivation: normalizeStringForCache(safeAnswers.motivation, 240),
    biggestChallenge: normalizeStringForCache(safeAnswers.biggestChallenge, 160),
    timeframeWeeks: Math.round(clampNumberForCache(safeAnswers.timeframeWeeks, 1, 104, 0)),
    cookingSkill: normalizeStringForCache(safeAnswers.cookingSkill, 40),
    availableEquipment: resolveAvailableEquipmentForCache(safeAnswers.availableEquipment),
    groceryPreference: normalizeStringForCache(safeAnswers.groceryPreference, 80),
    budgetPreference: normalizeStringForCache(safeAnswers.budgetPreference, 80),
    preferredMealStyle: normalizeStringForCache(safeAnswers.preferredMealStyle, 80),
    prepDay: normalizeStringForCache(safeAnswers.prepDay, 24),
    mealsPerDay,
    daysPerWeek: Math.round(clampNumberForCache(safeAnswers.daysPerWeek, 2, 7, 7)),
    selectedMealTypes,
    dietaryRequirements: normalizeTextListForCache(safeAnswers.dietaryRequirements, { limit: 12 }),
    preferredCuisines: normalizeTextListForCache(safeAnswers.preferredCuisines, { limit: 12 }),
    favoriteFoods: normalizeTextListForCache(safeAnswers.favoriteFoods, { limit: 16 }),
    allergies: normalizeTextListForCache(
      [...(Array.isArray(safeAnswers.allergyChips) ? safeAnswers.allergyChips : []), ...tokenizeFreeTextForCache(safeAnswers.allergiesText)],
      { limit: 16 }
    ),
    dislikes: normalizeTextListForCache(tokenizeFreeTextForCache(safeAnswers.dislikes), { limit: 16 }),
  };
  const intakeHash = crypto.createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
  const userCacheKey = `mealplan:${normalizeEmail(patientEmail)}:${intakeHash}`;
  const templateCacheKey = `mealplan:template:${intakeHash}`;
  return {
    cacheKey: userCacheKey,
    userCacheKey,
    templateCacheKey,
    intakeHash,
    normalized,
  };
}

function normalizeRecipeIdList(value) {
  const source = Array.isArray(value) ? value : [];
  const output = [];
  const seen = new Set();
  for (const entry of source) {
    const id = String(entry || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= 180) break;
  }
  return output;
}

function extractRecipeIdsFromMealPlan(mealPlan) {
  if (!mealPlan || typeof mealPlan !== 'object' || Array.isArray(mealPlan)) return [];
  const days = Array.isArray(mealPlan.days) ? mealPlan.days : [];
  const ids = [];
  for (const day of days) {
    const meals = day?.meals && typeof day.meals === 'object' && !Array.isArray(day.meals) ? day.meals : {};
    const breakfast = String(meals.breakfast || '').trim();
    const lunch = String(meals.lunch || '').trim();
    const dinner = String(meals.dinner || '').trim();
    if (breakfast) ids.push(breakfast);
    if (lunch) ids.push(lunch);
    if (dinner) ids.push(dinner);
    if (Array.isArray(meals.snacks)) {
      for (const snackId of meals.snacks) {
        const snack = String(snackId || '').trim();
        if (snack) ids.push(snack);
      }
    }
  }
  return normalizeRecipeIdList(ids);
}

function buildMealPlanCacheBundle({ mealPlan, recipes }) {
  const recipeIds = normalizeRecipeIdList([
    ...normalizeRecipeIdList((Array.isArray(recipes) ? recipes : []).map((recipe) => String(recipe?.id || '').trim())),
    ...extractRecipeIdsFromMealPlan(mealPlan),
  ]);
  if (!mealPlan || recipeIds.length === 0) return null;
  return {
    mealPlan,
    recipeIds,
  };
}

function normalizeConstraintToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeConstraintKey(value) {
  return normalizeConstraintToken(value).replace(/\s+/g, '');
}

function extractAnswerConstraintTokens(answers = {}) {
  const allergySource = [
    ...(Array.isArray(answers?.allergyChips) ? answers.allergyChips : []),
    ...tokenizeFreeTextForCache(answers?.allergiesText),
  ];
  const dislikeSource = [...tokenizeFreeTextForCache(answers?.dislikes)];
  const allergies = [...new Set(allergySource.map((entry) => normalizeConstraintToken(entry)).filter(Boolean))].slice(0, 20);
  const dislikes = [...new Set(dislikeSource.map((entry) => normalizeConstraintToken(entry)).filter(Boolean))].slice(0, 20);
  return { allergies, dislikes };
}

function recipeMatchesHardConstraints(recipe, constraints) {
  const allergenTerms = Array.isArray(constraints?.allergies) ? constraints.allergies : [];
  const dislikeTerms = Array.isArray(constraints?.dislikes) ? constraints.dislikes : [];
  const recipeAllergens = Array.isArray(recipe?.allergens) ? recipe.allergens : [];
  const allergenKeys = recipeAllergens.map((entry) => normalizeConstraintKey(entry)).filter(Boolean);
  const searchableText = normalizeConstraintToken(
    [
      recipe?.title,
      recipe?.description,
      ...(Array.isArray(recipe?.ingredients)
        ? recipe.ingredients.map((ingredient) =>
            typeof ingredient === 'string' ? ingredient : ingredient?.name || ingredient?.item || ''
          )
        : []),
    ]
      .filter(Boolean)
      .join(' '),
  );

  const hasBlockedAllergen = allergenTerms.some((term) => {
    const key = normalizeConstraintKey(term);
    if (!key) return false;
    if (allergenKeys.some((entry) => entry.includes(key) || key.includes(entry))) return true;
    return searchableText.includes(term);
  });
  if (hasBlockedAllergen) return false;

  const hasDislikedIngredient = dislikeTerms.some((term) => term && searchableText.includes(term));
  return !hasDislikedIngredient;
}

async function buildRuleFallbackBundleFromCatalog({ recipes, answers, includeSnack, seedSalt }) {
  const catalog = Array.isArray(recipes) ? recipes.filter((recipe) => recipe && recipe.id && recipe.title) : [];
  if (catalog.length === 0) return null;

  const constraints = extractAnswerConstraintTokens(answers);
  const filtered = catalog.filter((recipe) => recipeMatchesHardConstraints(recipe, constraints));
  const candidateCatalog = filtered.length >= 18 ? filtered : catalog;
  const { generateFallbackMealPlan } = await loadMealPlanAiModule();
  const mealPlan = generateFallbackMealPlan({
    recipes: candidateCatalog,
    includeSnack,
    seedSalt,
    answers,
  });
  if (!mealPlan) return null;

  const usedRecipeIds = new Set(extractRecipeIdsFromMealPlan(mealPlan));
  const selectedRecipes = candidateCatalog.filter((recipe) => usedRecipeIds.has(recipe.id));
  if (selectedRecipes.length === 0) return null;
  return {
    mealPlan,
    recipes: selectedRecipes,
    filteredRecipeCount: filtered.length,
    totalRecipeCount: catalog.length,
  };
}

async function loadLocalFallbackRecipeCatalog() {
  try {
    const raw = await fs.readFile(LOCAL_FALLBACK_RECIPE_CATALOG_PATH, 'utf8');
    const parsed = JSON.parse(raw || '{}');
    const recipes = Array.isArray(parsed?.recipes) ? parsed.recipes : [];
    return recipes.filter((recipe) => recipe && recipe.id && recipe.title);
  } catch (errorObject) {
    error('meal_plan.rules_fallback_local_catalog_failed', {
      path: LOCAL_FALLBACK_RECIPE_CATALOG_PATH,
      message: errorObject?.message || String(errorObject),
    });
    return [];
  }
}

async function hydrateMealPlanBundleFromCacheEntry(entry) {
  const bundle = entry?.bundle;
  if (!bundle || typeof bundle !== 'object') return null;
  const mealPlan = bundle.mealPlan && typeof bundle.mealPlan === 'object' && !Array.isArray(bundle.mealPlan) ? bundle.mealPlan : null;
  if (!mealPlan) return null;

  const recipeIds = normalizeRecipeIdList([
    ...normalizeRecipeIdList(bundle.recipeIds ?? bundle.recipe_ids),
    ...extractRecipeIdsFromMealPlan(mealPlan),
  ]);
  if (recipeIds.length === 0) return null;

  const persistedRecipes = await listMealPlannerRecipesByIds(recipeIds).catch(() => []);
  const persistedById = new Map(persistedRecipes.filter((recipe) => recipe?.id).map((recipe) => [recipe.id, recipe]));
  const legacyRecipes = Array.isArray(bundle.recipes) ? bundle.recipes : [];
  const legacyById = new Map(
    legacyRecipes
      .filter((recipe) => recipe && typeof recipe === 'object')
      .map((recipe) => [String(recipe.id || '').trim(), recipe])
      .filter(([id]) => Boolean(id))
  );

  const hydratedRecipes = recipeIds
    .map((id) => persistedById.get(id) || legacyById.get(id))
    .filter((recipe) => recipe && typeof recipe === 'object');
  if (hydratedRecipes.length === 0) return null;

  const hydratedById = new Set(hydratedRecipes.map((recipe) => String(recipe.id || '').trim()).filter(Boolean));
  const requiredIds = extractRecipeIdsFromMealPlan(mealPlan);
  if (requiredIds.some((id) => !hydratedById.has(id))) {
    return null;
  }

  return {
    mealPlan,
    recipes: hydratedRecipes,
  };
}

function getFrontendBaseUrl() {
  const configuredOrigin = normalizeOrigin(FRONTEND_BASE_URL);
  if (configuredOrigin && configuredOrigin !== '*') {
    return configuredOrigin;
  }

  if (DEFAULT_CORS_ORIGIN && DEFAULT_CORS_ORIGIN !== '*') {
    return DEFAULT_CORS_ORIGIN;
  }

  return APP_BASE_URL;
}

function buildPatientPasswordResetUrl(token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(PATIENT_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  return `${getFrontendBaseUrl()}${pathSegment}?token=${encodedToken}`;
}

function buildDoctorPasswordResetUrl(token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(DOCTOR_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const baseUrl = String(APP_BASE_URL || '').replace(/\/$/, '');
  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  const joiner = pathSegment.includes('?') ? '&' : '?';
  return `${baseUrl}${pathSegment}${joiner}token=${encodedToken}`;
}

async function resolveDoctorNotificationEmails() {
  const dynamicDoctorEmails = await listDoctorEmails();
  const deduped = Array.from(
    new Set(
      [...DOCTOR_NOTIFICATION_EMAILS_CONFIGURED, ...dynamicDoctorEmails]
        .map((email) => normalizeEmail(email))
        .filter((email) => isLikelyDoctorEmail(email))
    )
  );

  if (deduped.length === 0) {
    return ['doctor@onyahealth.com'];
  }
  return deduped;
}

function normalizeVerificationCode(value) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function buildCertificateVerificationCode(certificateId) {
  const normalizedId = normalizeVerificationCode(certificateId);
  const suffix = (normalizedId.slice(-8) || crypto.randomBytes(4).toString('hex').toUpperCase())
    .padStart(8, '0')
    .slice(-8);
  return `ONYA${suffix}`;
}

function getCertificateVerificationCode(certificate) {
  const existing = normalizeVerificationCode(certificate?.rawSubmission?.verificationCode);
  if (existing.startsWith('ONYA')) return existing;
  return buildCertificateVerificationCode(certificate?.id || '');
}

function maskPatientName(value) {
  const parts = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'Unavailable';
  return parts
    .map((part) => `${part.slice(0, 1).toUpperCase()}${'*'.repeat(Math.max(1, part.length - 1))}`)
    .join(' ');
}

function isApprovedCertificate(certificate) {
  const status = String(certificate?.status || '').toLowerCase();
  if (status === 'approved') return true;
  if (certificate?.decision?.result === 'approved') return true;
  return false;
}

function getPatientCertificatesForEmail(certificates, email) {
  const normalizedEmail = normalizeEmail(email);
  return certificates
    .filter((cert) => normalizeEmail(cert?.certificateDraft?.email) === normalizedEmail)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function patientSummaryFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  return {
    id: certificate.id,
    createdAt: certificate.createdAt,
    status: certificate.status,
    serviceType: certificate.serviceType || 'doctor',
    purpose: draft.purpose || '',
    symptom: draft.symptom || '',
    symptomVisibility: draft.symptomVisibility || 'private',
    description: draft.description || '',
    startDate: draft.startDate || null,
    durationDays: Number(draft.durationDays || 1),
    verificationCode: getCertificateVerificationCode(certificate),
    risk: certificate.risk || null,
    decision: certificate.decision || null,
  };
}

function buildPatientIdentity({ email, latestCertificate, account }) {
  const draft = latestCertificate?.certificateDraft || {};
  return {
    fullName: String(draft.fullName || account?.fullName || '').trim(),
    email: normalizeEmail(email || account?.email || draft.email || ''),
    dob: String(account?.dob || draft.dob || '').trim(),
    phone: String(account?.phone || draft.phone || '').trim(),
  };
}

function createBootstrapPassword() {
  return `Temp${crypto.randomBytes(12).toString('hex')}9A`;
}

async function resolveDoctorProfile(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  return getDoctorAccountByEmail(normalizedEmail);
}

function resolveDoctorDisplayName(account, fallbackEmail = '') {
  return (
    String(account?.fullName || '').trim() ||
    normalizeEmail(fallbackEmail) ||
    process.env.DOCTOR_DISPLAY_NAME ||
    'Onya Health Doctor'
  );
}

async function sendDoctorReviewEmail(certificate) {
  const reviewUrl = `${APP_BASE_URL}/doctor/login`;
  const recipients = await resolveDoctorNotificationEmails();
  const emailContent = renderDoctorReviewEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
    patientName: certificate.certificateDraft.fullName || 'Unknown patient',
    riskLabel: `${certificate.risk.level} (${certificate.risk.score})`,
    reviewUrl,
  });

  await sendEmail({
    to: recipients,
    subject: `Medical certificate review needed: ${certificate.id}`,
    html: emailContent.html,
    text: emailContent.text,
  });
  info('certificate.doctor_review_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    recipients,
  });
}

async function sendPatientDecisionEmail(certificate) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }

  if (certificate.status === 'approved') {
    const verificationCode = getCertificateVerificationCode(certificate);
    try {
      const pdfBuffer = await buildCertificatePdf(certificate, {
        doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        doctorNotes: certificate?.decision?.notes || '',
        providerType: certificate?.decision?.providerType || '',
        registrationNumber: certificate?.decision?.registrationNumber || '',
        verificationCode,
        verifyUrl: `${getFrontendBaseUrl()}/verify?code=${encodeURIComponent(verificationCode)}`,
      });
      const emailContent = renderPatientCertificateReadyEmail({
        baseUrl: getFrontendBaseUrl(),
        requestId: certificate.id,
        attachmentIncluded: true,
      });

      await sendEmail({
        to: patientEmail,
        subject: 'Your medical certificate is ready',
        html: emailContent.html,
        text: emailContent.text,
        attachments: [
          {
            filename: `medical-certificate-${certificate.id}.pdf`,
            contentBase64: pdfBuffer.toString('base64'),
          },
        ],
      });
      info('certificate.patient_email.sent', {
        certificateId: certificate.id,
        outcome: 'approved',
        provider: currentEmailProvider(),
        patientEmail,
        hasPdfAttachment: true,
      });
      return;
    } catch (errorObject) {
      error('certificate.patient_email.attachment_failed', {
        certificateId: certificate.id,
        patientEmail,
        message: errorObject?.message || String(errorObject),
      });

      const fallbackContent = renderPatientCertificateReadyEmail({
        baseUrl: getFrontendBaseUrl(),
        requestId: certificate.id,
        attachmentIncluded: false,
      });
      await sendEmail({
        to: patientEmail,
        subject: 'Your medical certificate is ready',
        html: fallbackContent.html,
        text: fallbackContent.text,
      });
      info('certificate.patient_email.sent', {
        certificateId: certificate.id,
        outcome: 'approved',
        provider: currentEmailProvider(),
        patientEmail,
        hasPdfAttachment: false,
        fallbackNoAttachment: true,
      });
      return;
    }
  }

  const emailContent = renderPatientCertificateDeniedEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
  });
  await sendEmail({
    to: patientEmail,
    subject: 'Update on your medical certificate request',
    html: emailContent.html,
    text: emailContent.text,
  });
  info('certificate.patient_email.sent', {
    certificateId: certificate.id,
    outcome: 'denied',
    provider: currentEmailProvider(),
    patientEmail,
    hasPdfAttachment: false,
  });
}

async function sendPatientMoreInfoEmail(certificate, doctorEmail, notes) {
  const patientEmail = certificate.certificateDraft.email;
  if (!patientEmail) {
    return;
  }
  const emailContent = renderPatientMoreInfoEmail({
    baseUrl: getFrontendBaseUrl(),
    requestId: certificate.id,
    doctorEmail,
    notes,
  });

  await sendEmail({
    to: patientEmail,
    subject: 'More information requested for your medical certificate',
    html: emailContent.html,
    text: emailContent.text,
  });
  info('certificate.more_info_email.sent', {
    certificateId: certificate.id,
    provider: currentEmailProvider(),
    patientEmail,
    doctorEmail,
  });
}

async function markPaidFromStripeSession(session, trigger = 'stripe_event') {
  const certificateId =
    session?.metadata?.certificate_id ||
    session?.client_reference_id ||
    session?.subscription_details?.metadata?.certificate_id ||
    null;

  if (!certificateId) {
    return { ok: false, reason: 'missing_certificate_id' };
  }

  const current = await getCertificateById(certificateId);
  if (!current) {
    return { ok: false, reason: 'certificate_not_found', certificateId };
  }

  const alreadyPaid = current?.rawSubmission?.payment?.status === 'paid';
  if (alreadyPaid) {
    const currentPatientEmail = normalizeEmail(current?.certificateDraft?.email || '');
    if (isSubscriptionLikeCheckoutSession(session)) {
      try {
        await syncPatientBillingFromStripeSession(session, {
          fallbackPatientEmail: currentPatientEmail,
          source: `stripe.${trigger || 'payment'}`,
        });
      } catch (billingSyncError) {
        error('patient.billing.sync_from_paid_session_failed', {
          certificateId,
          patientEmail: currentPatientEmail,
          message: billingSyncError?.message || String(billingSyncError),
        });
      }
    }
    return {
      ok: true,
      updated: false,
      certificateId,
      status: current.status,
      patientEmail: normalizeEmail(current?.certificateDraft?.email || ''),
    };
  }

  const updated = await updateCertificate(certificateId, (certificate) => ({
    ...certificate,
    status: isOpenForReview(certificate.status) ? certificate.status : 'pending',
    rawSubmission: {
      ...(certificate.rawSubmission || {}),
      payment: {
        ...(certificate.rawSubmission?.payment || {}),
        provider: 'stripe',
        mode:
          String(certificate.rawSubmission?.payment?.mode || '').toLowerCase() === 'subscription' ||
          String(session?.mode || '').toLowerCase() === 'subscription'
            ? 'subscription'
            : 'payment',
        status: 'paid',
        stripeSessionId: session.id || null,
        stripeCustomerId: session.customer || null,
        stripePaymentIntentId: session.payment_intent || null,
        stripeSubscriptionId: session.subscription || null,
        paidAt: new Date().toISOString(),
        amountTotal: session.amount_total || null,
        currency: session.currency || 'aud',
      },
    },
  }));

  if (updated && isOpenForReview(updated.status)) {
    await appendAudit({
      type: 'PAYMENT_CONFIRMED',
      certificateId: updated.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      trigger,
    });
    await sendDoctorReviewEmail(updated);
    info('stripe.payment.confirmed', {
      certificateId: updated.id,
      stripeSessionId: session.id || null,
      trigger,
      status: updated.status,
    });
  }

  const updatedPatientEmail = normalizeEmail(updated?.certificateDraft?.email || current?.certificateDraft?.email || '');
  if (isSubscriptionLikeCheckoutSession(session)) {
    try {
      await syncPatientBillingFromStripeSession(session, {
        fallbackPatientEmail: updatedPatientEmail,
        source: `stripe.${trigger || 'payment'}`,
      });
    } catch (billingSyncError) {
      error('patient.billing.sync_from_checkout_session_failed', {
        certificateId,
        patientEmail: updatedPatientEmail,
        message: billingSyncError?.message || String(billingSyncError),
      });
    }
  }

  return {
    ok: true,
    updated: true,
    certificateId: updated?.id || certificateId,
    status: updated?.status || null,
    patientEmail: updatedPatientEmail,
  };
}

async function fetchStripeCheckoutSession(sessionId) {
  if (!STRIPE_SECRET_KEY) {
    throw new Error('Stripe is not configured on the server');
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
    const errorObject = new Error(message);
    errorObject.status = response.status;
    throw errorObject;
  }

  return payload;
}

function normalizeStripeSubscriptionStatus(value) {
  return String(value || '')
    .trim()
    .toLowerCase();
}

function isStripeSubscriptionActiveStatus(status) {
  return ACTIVE_STRIPE_SUBSCRIPTION_STATUSES.has(normalizeStripeSubscriptionStatus(status));
}

function unixSecondsToIso(value) {
  const seconds = Number(value || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return new Date(seconds * 1000).toISOString();
}

async function fetchStripeSubscription(subscriptionId) {
  const normalizedId = String(subscriptionId || '').trim();
  if (!normalizedId) return null;
  if (!STRIPE_SECRET_KEY) return null;

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(normalizedId)}`, {
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
    const message = payload?.error?.message || `Unable to load Stripe subscription (${response.status})`;
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  return payload;
}

async function fetchStripeSubscriptionCached(subscriptionId) {
  const normalizedId = String(subscriptionId || '').trim();
  if (!normalizedId) return null;

  const now = Date.now();
  const cached = stripeSubscriptionCache.get(normalizedId);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const value = await fetchStripeSubscription(normalizedId);
  stripeSubscriptionCache.set(normalizedId, {
    value,
    expiresAt: now + STRIPE_SUBSCRIPTION_CACHE_TTL_MS,
  });
  return value;
}

async function fetchStripeCustomer(customerId) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) return null;
  if (!STRIPE_SECRET_KEY) return null;

  const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(normalizedCustomerId)}`, {
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
    const message = payload?.error?.message || `Unable to load Stripe customer (${response.status})`;
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  return payload || null;
}

function stripeSubscriptionContainsUnlimitedProduct(subscription) {
  const targetProduct = String(STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || '').trim();
  if (!targetProduct) return true;

  const items = Array.isArray(subscription?.items?.data) ? subscription.items.data : [];
  if (items.length === 0) return true;
  return items.some((item) => String(item?.price?.product || '').trim() === targetProduct);
}

function emptyBillingProfileForEmail(email = '') {
  return {
    patientEmail: normalizeEmail(email || ''),
    hasActiveUnlimited: false,
    plan: 'pay_as_you_go',
    subscriptionStatus: 'none',
    stripeCustomerId: '',
    stripeSubscriptionId: '',
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    canManageSubscription: false,
    latestSubscriptionRequestId: null,
  };
}

function normalizeBillingProfile(input, email = '') {
  const base = emptyBillingProfileForEmail(email);
  if (!input || typeof input !== 'object') return base;

  const value = input;
  const hasActiveUnlimited = Boolean(value.hasActiveUnlimited);
  const stripeCustomerId = String(value.stripeCustomerId || '').trim();
  const stripeSubscriptionId = String(value.stripeSubscriptionId || '').trim();

  return {
    ...base,
    patientEmail: normalizeEmail(value.patientEmail || base.patientEmail),
    hasActiveUnlimited,
    plan: String(value.plan || (hasActiveUnlimited ? 'unlimited' : 'pay_as_you_go')).trim(),
    subscriptionStatus: String(value.subscriptionStatus || (hasActiveUnlimited ? 'active' : 'none')).trim(),
    stripeCustomerId,
    stripeSubscriptionId,
    cancelAtPeriodEnd: Boolean(value.cancelAtPeriodEnd),
    currentPeriodEnd: value.currentPeriodEnd ? String(value.currentPeriodEnd) : null,
    canManageSubscription: Boolean(isStripeEnabled() && stripeCustomerId),
    latestSubscriptionRequestId: value.latestSubscriptionRequestId || null,
  };
}

function buildBillingPatchFromStripeSubscription(subscription, fallbackPatientEmail = '', source = '') {
  const status = normalizeStripeSubscriptionStatus(subscription?.status || '');
  const hasActiveUnlimited = isStripeSubscriptionActiveStatus(status) && stripeSubscriptionContainsUnlimitedProduct(subscription);
  return {
    patientEmail: normalizeEmail(subscription?.metadata?.patient_email || fallbackPatientEmail || ''),
    hasActiveUnlimited,
    plan: hasActiveUnlimited ? 'unlimited' : 'pay_as_you_go',
    subscriptionStatus: status || 'unknown',
    stripeCustomerId: String(subscription?.customer || '').trim(),
    stripeSubscriptionId: String(subscription?.id || '').trim(),
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    currentPeriodEnd: unixSecondsToIso(subscription?.current_period_end),
    source,
  };
}

async function resolvePatientEmailFromStripeCustomer(customerId) {
  const customer = await fetchStripeCustomer(customerId);
  return normalizeEmail(customer?.email || '');
}

async function syncPatientBillingFromStripeSubscription(subscription, options = {}) {
  const source = String(options?.source || 'stripe.subscription').trim();
  const fallbackPatientEmail = normalizeEmail(options?.fallbackPatientEmail || '');
  const patch = buildBillingPatchFromStripeSubscription(subscription, fallbackPatientEmail, source);
  let patientEmail = '';

  if (patch.stripeCustomerId) {
    patientEmail = await resolvePatientEmailFromStripeCustomer(patch.stripeCustomerId);
  }
  if (!patientEmail) {
    patientEmail = patch.patientEmail;
  }
  patch.patientEmail = patientEmail;

  if (!patientEmail) {
    return null;
  }

  const saved = await upsertPatientBillingByEmail(patientEmail, patch);
  return normalizeBillingProfile(saved || patch, patientEmail);
}

function isPaidLikePaymentStatus(value) {
  const status = String(value || '').trim().toLowerCase();
  return status === 'paid' || status === 'no_payment_required';
}

function isSubscriptionLikeCheckoutSession(session) {
  return (
    String(session?.mode || '').toLowerCase() === 'subscription' ||
    Boolean(String(session?.subscription || '').trim())
  );
}

async function syncPatientBillingFromStripeSession(session, options = {}) {
  if (!isSubscriptionLikeCheckoutSession(session)) {
    return null;
  }

  const source = String(options?.source || 'stripe.checkout').trim();
  const fallbackPatientEmail = normalizeEmail(
    options?.fallbackPatientEmail ||
      session?.metadata?.patient_email ||
      session?.subscription_details?.metadata?.patient_email ||
      ''
  );
  const subscriptionId = String(session?.subscription || '').trim();

  if (subscriptionId) {
    const subscription = await fetchStripeSubscriptionCached(subscriptionId);
    if (subscription) {
      return syncPatientBillingFromStripeSubscription(subscription, {
        source,
        fallbackPatientEmail,
      });
    }
  }

  const status = isPaidLikePaymentStatus(session?.payment_status) ? 'active' : 'incomplete';
  const fallbackPatch = {
    patientEmail: fallbackPatientEmail,
    hasActiveUnlimited: isPaidLikePaymentStatus(session?.payment_status),
    plan: isPaidLikePaymentStatus(session?.payment_status) ? 'unlimited' : 'pay_as_you_go',
    subscriptionStatus: status,
    stripeCustomerId: String(session?.customer || '').trim(),
    stripeSubscriptionId: subscriptionId,
    cancelAtPeriodEnd: false,
    currentPeriodEnd: null,
    source,
  };

  if (!fallbackPatch.patientEmail && fallbackPatch.stripeCustomerId) {
    fallbackPatch.patientEmail = await resolvePatientEmailFromStripeCustomer(fallbackPatch.stripeCustomerId);
  }
  if (!fallbackPatch.patientEmail) return null;

  const saved = await upsertPatientBillingByEmail(fallbackPatch.patientEmail, fallbackPatch);
  return normalizeBillingProfile(saved || fallbackPatch, fallbackPatch.patientEmail);
}

function mostRecentLocalSubscriptionPayment(certificates, patientEmail) {
  const patientCertificates = getPatientCertificatesForEmail(certificates, patientEmail);
  for (const certificate of patientCertificates) {
    const payment = certificate?.rawSubmission?.payment || null;
    if (!payment) continue;
    const mode = String(payment.mode || '').trim().toLowerCase();
    if (mode !== 'subscription') continue;
    return {
      certificate,
      payment,
    };
  }
  return null;
}

function resolveLocalBillingProfileFromCertificates(certificates, patientEmail) {
  const email = normalizeEmail(patientEmail);
  const empty = emptyBillingProfileForEmail(email);
  const latest = mostRecentLocalSubscriptionPayment(certificates, email);
  if (!latest) return empty;

  const payment = latest.payment || {};
  const paid = isPaidLikePaymentStatus(payment.status);
  return normalizeBillingProfile(
    {
      patientEmail: email,
      hasActiveUnlimited: paid,
      plan: paid ? 'unlimited' : 'pay_as_you_go',
      subscriptionStatus: paid ? 'active' : String(payment.status || 'inactive').toLowerCase(),
      stripeCustomerId: String(payment.stripeCustomerId || '').trim(),
      stripeSubscriptionId: String(payment.stripeSubscriptionId || '').trim(),
      cancelAtPeriodEnd: false,
      currentPeriodEnd: null,
      latestSubscriptionRequestId: latest.certificate?.id || null,
    },
    email
  );
}

async function resolvePatientBillingProfile(patientEmail, certificatesInput = null) {
  const email = normalizeEmail(patientEmail);
  const empty = emptyBillingProfileForEmail(email);
  if (!email) return empty;

  try {
    const stored = await getPatientBillingByEmail(email);
    if (stored) {
      return normalizeBillingProfile(stored, email);
    }
  } catch (errorObject) {
    error('patient.billing.lookup_failed', {
      patientEmail: email,
      message: errorObject?.message || String(errorObject),
    });
  }

  if (isSupabaseStorageEnabled()) {
    return empty;
  }

  const certificates = Array.isArray(certificatesInput) ? certificatesInput : await listCertificates();
  return resolveLocalBillingProfileFromCertificates(certificates, email);
}

function buildStripeBillingReturnUrl() {
  const baseUrl = getFrontendBaseUrl();
  const fallback = String(STRIPE_BILLING_PORTAL_RETURN_PATH || '/patient').trim();
  const path = fallback.startsWith('/') ? fallback : `/${fallback}`;
  return `${baseUrl}${path}`;
}

async function createStripeBillingPortalSession(customerId, returnUrl) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) {
    const errorObject = new Error('Stripe customer id is required');
    errorObject.status = 400;
    throw errorObject;
  }
  if (!STRIPE_SECRET_KEY) {
    const errorObject = new Error('Stripe is not configured on the server');
    errorObject.status = 500;
    throw errorObject;
  }

  const params = new URLSearchParams();
  params.set('customer', normalizedCustomerId);
  params.set('return_url', String(returnUrl || '').trim());

  const response = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
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
    const message = payload?.error?.message || `Unable to create Stripe billing portal session (${response.status})`;
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  return payload;
}

async function cancelStripeSubscriptionAtPeriodEnd(subscriptionId) {
  const normalizedId = String(subscriptionId || '').trim();
  if (!normalizedId) {
    const errorObject = new Error('Stripe subscription id is required');
    errorObject.status = 400;
    throw errorObject;
  }
  if (!STRIPE_SECRET_KEY) {
    const errorObject = new Error('Stripe is not configured on the server');
    errorObject.status = 500;
    throw errorObject;
  }

  const params = new URLSearchParams();
  params.set('cancel_at_period_end', 'true');

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(normalizedId)}`, {
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
    const message = payload?.error?.message || `Unable to update Stripe subscription (${response.status})`;
    const errorObject = new Error(message);
    errorObject.status = response.status;
    errorObject.data = payload;
    throw errorObject;
  }

  stripeSubscriptionCache.delete(normalizedId);
  return payload;
}

async function patientAccountExists(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;
  const account = await getPatientAccountByEmail(normalized);
  return Boolean(account);
}

async function patientAccountExistsByEmailOrPhone({ email, phone }) {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail && await patientAccountExists(normalizedEmail)) {
    return { exists: true, reason: 'email', email: normalizedEmail };
  }

  const normalizedPhone = String(phone || '').replace(/\D+/g, '');
  if (normalizedPhone.length < 6) {
    return { exists: false, reason: '', email: '' };
  }

  const certificates = await listCertificates();
  const match = certificates.find((certificate) => {
    const draft = certificate?.certificateDraft || {};
    return String(draft.phone || '').replace(/\D+/g, '') === normalizedPhone;
  });
  if (!match) {
    return { exists: false, reason: '', email: '' };
  }
  return {
    exists: true,
    reason: 'phone',
    email: normalizeEmail(match?.certificateDraft?.email || ''),
  };
}

async function handleApi(req, res, url) {
  setCors(res, req);

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/stripe/webhook') {
    try {
      const rawBody = await parseRawBody(req);
      const signature = req.headers['stripe-signature'];
      const event = verifyStripeEvent(rawBody, signature);

      if (event?.type === 'checkout.session.completed') {
        const session = event?.data?.object || {};
        await markPaidFromStripeSession(session, 'stripe_webhook');
      }
      if (
        event?.type === 'customer.subscription.created' ||
        event?.type === 'customer.subscription.updated' ||
        event?.type === 'customer.subscription.deleted'
      ) {
        const subscription = event?.data?.object || {};
        try {
          await syncPatientBillingFromStripeSubscription(subscription, {
            source: `stripe.${event.type}`,
          });
        } catch (billingSyncError) {
          error('patient.billing.sync_from_subscription_webhook_failed', {
            eventType: event?.type || '',
            message: billingSyncError?.message || String(billingSyncError),
          });
        }
      }

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ received: true }));
      return;
    } catch (errorObject) {
      error('stripe.webhook.failed', {
        message: errorObject?.message || String(errorObject),
      });
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify({ error: 'Invalid Stripe webhook' }));
      return;
    }
  }

  if (req.method === 'GET' && url.pathname === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'onya-health-backend',
      storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/certificates/verify') {
    const verificationCode = normalizeVerificationCode(url.searchParams.get('code') || '');
    if (!verificationCode) {
      sendJson(res, 400, { valid: false, error: 'Verification code is required' });
      return;
    }

    const certificates = await listCertificates();
    const certificate = certificates.find(
      (item) => getCertificateVerificationCode(item) === verificationCode
    );
    if (!certificate) {
      sendJson(res, 404, { valid: false, error: 'Certificate not found' });
      return;
    }
    if (!isApprovedCertificate(certificate)) {
      sendJson(res, 409, {
        valid: false,
        error: 'Certificate is not approved',
        status: certificate.status || null,
      });
      return;
    }

    const issuedAt = certificate?.decision?.at || certificate.createdAt || new Date().toISOString();
    sendJson(res, 200, {
      valid: true,
      certificate: {
        code: verificationCode,
        certificateId: certificate.id,
        issuedAt,
        status: certificate.status,
        startDate: certificate?.certificateDraft?.startDate || null,
        durationDays: Number(certificate?.certificateDraft?.durationDays || 1),
        purpose: certificate?.certificateDraft?.purpose || '',
        patient: maskPatientName(certificate?.certificateDraft?.fullName || ''),
        doctorName:
          String(certificate?.decision?.by || '').trim() ||
          process.env.DOCTOR_DISPLAY_NAME ||
          'Onya Health Doctor',
        providerType: String(certificate?.decision?.providerType || '').trim(),
        registrationNumber: String(certificate?.decision?.registrationNumber || '')
          .trim()
          .toUpperCase(),
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/certificates') {
    const body = await parseJsonBody(req);
    const patient = body.patient || {};

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const certificateId = crypto.randomUUID();
    const verificationCode = buildCertificateVerificationCode(certificateId);
    const certificate = {
      id: certificateId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft: buildDraftCertificate(body),
      rawSubmission: {
        ...body,
        verificationCode,
      },
      decision: null,
    };

    await createCertificate(certificate);
    await appendAudit({
      type: 'DOCTOR_NOTIFICATION_TRIGGERED',
      certificateId: certificate.id,
    });
    await sendDoctorReviewEmail(certificate);
    info('certificate.submitted', {
      certificateId: certificate.id,
      serviceType: certificate.serviceType,
      riskLevel: certificate.risk.level,
      riskScore: certificate.risk.score,
    });

    sendJson(res, 201, {
      id: certificate.id,
      verificationCode,
      status: certificate.status,
      risk: certificate.risk,
      message: 'Certificate submitted for doctor review',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout/session') {
    const body = await parseJsonBody(req);
    const requestedUiMode = body?.uiMode === 'embedded' ? 'embedded' : 'hosted';
    const patient = body.patient || {};
    const certificateDraft = buildDraftCertificate(body);
    if (certificateDraft.includeCarerCertificate) {
      const carerValidation = validateCarerCertificateDetails(certificateDraft.carerCertificateDetails);
      if (!carerValidation.valid) {
        sendJson(res, 400, {
          error: `Carer certificate details incomplete: ${carerValidation.errors.join(', ')}`,
          code: 'CARER_CERTIFICATE_DETAILS_REQUIRED',
          details: carerValidation.errors,
        });
        return;
      }
      certificateDraft.carerCertificateDetails = carerValidation.details;
    }
    body.consult = {
      ...(body?.consult || {}),
      startDate: certificateDraft.startDate,
      durationDays: certificateDraft.durationDays,
      includeCarerCertificate: certificateDraft.includeCarerCertificate,
      carerCertificateDetails: certificateDraft.carerCertificateDetails,
    };

    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe is not configured on the server' });
      return;
    }

    if (!patient.fullName || !patient.email) {
      sendJson(res, 400, { error: 'fullName and email are required' });
      return;
    }

    const risk = calculateRisk(body);
    const pricing = stripePricingFromRequest(body);
    const normalizedPatientEmail = normalizeEmail(patient.email);
    const patientAuth = getPatientAuth(req);
    const canUseSubscriptionBypass =
      Boolean(patientAuth?.email) && normalizedPatientEmail === normalizeEmail(patientAuth.email);

    if (canUseSubscriptionBypass) {
      const certificates = await listCertificates();
      const billing = await resolvePatientBillingProfile(normalizedPatientEmail, certificates);
      if (billing.hasActiveUnlimited) {
        const certificateId = crypto.randomUUID();
        const verificationCode = buildCertificateVerificationCode(certificateId);
        const paidAt = new Date().toISOString();
        const certificate = {
          id: certificateId,
          createdAt: paidAt,
          status: 'pending',
          serviceType: body.serviceType || 'doctor',
          risk,
          certificateDraft,
          rawSubmission: {
            ...body,
            verificationCode,
            payment: {
              provider: 'stripe',
              mode: 'subscription',
              status: 'paid',
              paidAt,
              amount: 0,
              baseAmount: 0,
              amountTotal: 0,
              currency: 'aud',
              stripeCustomerId: billing.stripeCustomerId || null,
              stripeSubscriptionId: billing.stripeSubscriptionId || null,
              includeCarerCertificate: Boolean(certificateDraft.includeCarerCertificate),
              coveredByUnlimitedPlan: true,
            },
          },
          decision: null,
        };

        await createCertificate(certificate);
        await appendAudit({
          type: 'CHECKOUT_BYPASSED_ACTIVE_SUBSCRIPTION',
          certificateId: certificate.id,
          email: normalizedPatientEmail,
          stripeCustomerId: billing.stripeCustomerId || null,
          stripeSubscriptionId: billing.stripeSubscriptionId || null,
        });
        await appendAudit({
          type: 'PAYMENT_CONFIRMED',
          certificateId: certificate.id,
          provider: 'stripe',
          trigger: 'active_subscription_coverage',
          stripeSubscriptionId: billing.stripeSubscriptionId || null,
        });
        await sendDoctorReviewEmail(certificate);

        info('checkout.session.bypassed_active_subscription', {
          certificateId: certificate.id,
          patientEmail: normalizedPatientEmail,
          stripeCustomerId: billing.stripeCustomerId || null,
          stripeSubscriptionId: billing.stripeSubscriptionId || null,
        });

        sendJson(res, 200, {
          certificateId: certificate.id,
          verificationCode: getCertificateVerificationCode(certificate),
          checkoutBypassed: true,
          status: certificate.status,
          patientEmail: normalizedPatientEmail,
          hasActiveUnlimited: true,
          requiresAccountSetup: false,
          redirectUrl: '/patient',
        });
        return;
      }
    }

    const certificateId = crypto.randomUUID();
    const verificationCode = buildCertificateVerificationCode(certificateId);
    const certificate = {
      id: certificateId,
      createdAt: new Date().toISOString(),
      status: 'pending',
      serviceType: body.serviceType || 'doctor',
      risk,
      certificateDraft,
      rawSubmission: {
        ...body,
        verificationCode,
        payment: {
          provider: 'stripe',
          status: 'initiated',
          amount: pricing.unitAmount,
          baseAmount: pricing.baseUnitAmount,
          carerCertificateAmount: pricing.carerCertificateAmount,
          includeCarerCertificate: pricing.includeCarerCertificate,
          currency: 'aud',
          mode: pricing.mode,
        },
      },
      decision: null,
    };

    const sessionPromise = createStripeCheckoutSession({ certificate, pricing, uiMode: requestedUiMode });
    const persistPromise = createCertificate(certificate);
    const [session] = await Promise.all([sessionPromise, persistPromise]);

    appendAudit({
      type: 'CHECKOUT_SESSION_CREATED',
      certificateId: certificate.id,
      provider: 'stripe',
      stripeSessionId: session.id || null,
      amount: pricing.unitAmount,
      mode: pricing.mode,
      includeCarerCertificate: pricing.includeCarerCertificate,
    }).catch((auditError) => {
      error('checkout.session.audit_failed', {
        certificateId: certificate.id,
        message: auditError?.message || String(auditError),
      });
    });

    sendJson(res, 200, {
      certificateId: certificate.id,
      verificationCode,
      checkoutUrl: session.url,
      sessionId: session.id,
      clientSecret: session.client_secret || null,
      uiMode: requestedUiMode,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/account-exists') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body?.email);
    const phone = String(body?.phone || '').trim();
    if (!email && !phone) {
      sendJson(res, 400, { error: 'email or phone is required' });
      return;
    }

    let result = { exists: false, reason: '', email: '' };
    try {
      result = await patientAccountExistsByEmailOrPhone({ email, phone });
    } catch (errorObject) {
      error('patient.account_exists.lookup_failed', {
        email,
        hasPhone: Boolean(phone),
        message: errorObject?.message || String(errorObject),
      });
      sendJson(res, 200, {
        ok: false,
        exists: false,
        reason: 'lookup_unavailable',
        matchedEmail: '',
        message: "We couldn't verify account status right now. You can continue and we'll check again.",
      });
      return;
    }
    sendJson(res, 200, {
      ok: true,
      exists: Boolean(result.exists),
      reason: result.reason,
      matchedEmail: result.email || '',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/checkout/confirm') {
    const body = await parseJsonBody(req);
    const sessionId =
      String(url.searchParams.get('session_id') || '').trim() ||
      String(body?.sessionId || body?.session_id || '').trim();

    if (!sessionId) {
      sendJson(res, 400, { error: 'session_id is required' });
      return;
    }

    const session = await fetchStripeCheckoutSession(sessionId);
    const paymentStatus = String(session?.payment_status || '').toLowerCase();
    if (!['paid', 'no_payment_required'].includes(paymentStatus)) {
      sendJson(res, 409, {
        error: 'Payment is not completed yet',
        paymentStatus: session?.payment_status || null,
      });
      return;
    }

    const result = await markPaidFromStripeSession(session, 'checkout_success_confirm');
    const patientEmail = normalizeEmail(result?.patientEmail || session?.metadata?.patient_email || '');
    const accountExists = patientEmail ? await patientAccountExists(patientEmail) : false;
    sendJson(res, 200, {
      ok: true,
      sessionId,
      paymentStatus: session?.payment_status || null,
      certificateId: result?.certificateId || null,
      status: result?.status || null,
      updated: Boolean(result?.updated),
      patientEmail,
      accountExists,
      requiresAccountSetup: Boolean(patientEmail) && !accountExists,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/checkout/account/setup') {
    const body = await parseJsonBody(req);
    const sessionId = String(body?.sessionId || body?.session_id || '').trim();
    const email = normalizeEmail(body?.email);
    const confirmEmail = normalizeEmail(body?.confirmEmail || body?.confirm_email || '');
    const password = String(body?.password || '');

    if (!sessionId || !email || !confirmEmail || !password) {
      sendJson(res, 400, { error: 'sessionId, email, confirmEmail, and password are required' });
      return;
    }

    if (email !== confirmEmail) {
      sendJson(res, 400, { error: 'Email confirmation does not match' });
      return;
    }

    const session = await fetchStripeCheckoutSession(sessionId);
    const paymentStatus = String(session?.payment_status || '').toLowerCase();
    if (!['paid', 'no_payment_required'].includes(paymentStatus)) {
      sendJson(res, 409, {
        error: 'Payment is not completed yet',
        paymentStatus: session?.payment_status || null,
      });
      return;
    }

    const result = await markPaidFromStripeSession(session, 'checkout_account_setup');
    const expectedEmail = normalizeEmail(result?.patientEmail || session?.metadata?.patient_email || '');
    if (!expectedEmail) {
      sendJson(res, 400, { error: 'Unable to determine the patient email for this checkout' });
      return;
    }
    if (email !== expectedEmail) {
      sendJson(res, 400, { error: `Email must match the consult email (${expectedEmail})` });
      return;
    }

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, expectedEmail);
    const latest = patientCertificates[0] || null;
    const fullName = String(latest?.certificateDraft?.fullName || '').trim();
    const dob = String(latest?.certificateDraft?.dob || '').trim();
    const phone = String(latest?.certificateDraft?.phone || '').trim();

    if (await patientAccountExists(expectedEmail)) {
      sendJson(res, 409, {
        error: 'An account already exists for this email. Please sign in to continue.',
        code: 'ACCOUNT_EXISTS',
        loginPath: '/patient-login',
        patientEmail: expectedEmail,
      });
      return;
    }

    let account = null;
    try {
      account = await createPatientAccount({
        email: expectedEmail,
        password,
        fullName,
        dob,
        phone,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      if (errorObject?.code === 'ACCOUNT_EXISTS') {
        sendJson(res, 409, {
          error: 'An account already exists for this email. Please sign in to continue.',
          code: 'ACCOUNT_EXISTS',
          loginPath: '/patient-login',
          patientEmail: expectedEmail,
        });
        return;
      }
      throw errorObject;
    }

    const patientToken = issuePatientToken(expectedEmail);
    await appendAudit({
      type: 'PATIENT_ACCOUNT_SETUP_FROM_CHECKOUT',
      email: expectedEmail,
      stripeSessionId: sessionId,
    });

    sendJson(res, 200, {
      ok: true,
      token: patientToken,
      patientEmail: expectedEmail,
      patient: buildPatientIdentity({
        email: expectedEmail,
        latestCertificate: latest,
        account: account || null,
      }),
    });
    info('patient.checkout_account_setup.completed', {
      email: expectedEmail,
      stripeSessionId: sessionId,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/login') {
    sendJson(res, 405, {
      error: 'Method not allowed. Use POST to log in.',
      method: 'POST',
      endpoint: '/api/patient/login',
      loginPath: '/patient-login',
      exampleBody: {
        email: 'you@example.com',
        password: 'YourPassword123',
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/login') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    if (!email) {
      sendJson(res, 400, { error: 'Email is required' });
      return;
    }
    if (!password) {
      sendJson(res, 400, { error: 'Password is required. Use a magic sign-in link if needed.' });
      return;
    }

    const account = await authenticatePatientAccount({ email, password });
    if (!account) {
      sendJson(res, 401, { error: 'Invalid email or password' });
      return;
    }

    const token = issuePatientToken(email);
    sendJson(res, 200, {
      token,
      patient: buildPatientIdentity({ email, latestCertificate: null, account }),
    });
    info('patient.login.success', { email, method: 'password' });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/register') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.name || '').trim();
    const dob = String(body.dob || '').trim();
    const phone = String(body.phone || '').trim();

    if (!isLikelyPatientEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    let account;
    try {
      account = await createPatientAccount({
        email,
        password,
        fullName,
        dob,
        phone,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'ACCOUNT_EXISTS') {
        sendJson(res, 409, { error: 'An account already exists for this email' });
        return;
      }
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'PATIENT_ACCOUNT_CREATED',
      email,
    });

    try {
      const welcomeEmail = renderPatientWelcomeEmail({
        baseUrl: getFrontendBaseUrl(),
        fullName: account.fullName || fullName,
      });
      await sendEmail({
        to: email,
        subject: 'Welcome to Onya Health',
        html: welcomeEmail.html,
        text: welcomeEmail.text,
      });
    } catch (errorObject) {
      error('patient.register.welcome_email_failed', {
        email,
        message: errorObject?.message || String(errorObject),
      });
    }

    const token = issuePatientToken(email);
    sendJson(res, 201, {
      token,
      patient: buildPatientIdentity({ email, latestCertificate: null, account }),
    });
    info('patient.register.success', { email });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/password/reset/request') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);

    if (!isLikelyPatientEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    try {
    let resetPayload = await issuePasswordResetToken(email, PATIENT_PASSWORD_RESET_TTL_MS);
    if (!resetPayload) {
      const certificates = await listCertificates();
      const patientCertificates = getPatientCertificatesForEmail(certificates, email);
      const latest = patientCertificates[0] || null;

      if (latest?.certificateDraft?.email) {
        try {
          await createPatientAccount({
            email,
            password: createBootstrapPassword(),
            fullName: latest.certificateDraft.fullName || '',
            dob: latest.certificateDraft.dob || '',
            phone: latest.certificateDraft.phone || '',
          });
        } catch (errorObject) {
          if (errorObject?.code !== 'ACCOUNT_EXISTS') {
            throw errorObject;
          }
        }

        await updatePatientAccountProfile({
          email,
          fullName: latest.certificateDraft.fullName || '',
          dob: latest.certificateDraft.dob || '',
          phone: latest.certificateDraft.phone || '',
        });

        resetPayload = await issuePasswordResetToken(email, PATIENT_PASSWORD_RESET_TTL_MS);
        if (resetPayload) {
          await appendAudit({
            type: 'PATIENT_ACCOUNT_BOOTSTRAPPED_FOR_RESET',
            email,
          });
        }
      }
    }

    if (resetPayload) {
      const resetUrl = buildPatientPasswordResetUrl(resetPayload.token);
      const resetEmail = renderPatientPasswordResetEmail({
        baseUrl: getFrontendBaseUrl(),
        resetUrl,
        expiresMinutes: String(Math.round(PATIENT_PASSWORD_RESET_TTL_MS / (1000 * 60))),
      });
      await sendEmail({
        to: email,
        subject: 'Reset your Onya Health password',
        html: resetEmail.html,
        text: resetEmail.text,
      });
      await appendAudit({
        type: 'PATIENT_PASSWORD_RESET_REQUESTED',
        email,
      });
      info('patient.password_reset.requested', {
        email,
        provider: currentEmailProvider(),
      });
    } else {
      info('patient.password_reset.request_skipped', {
        email,
        reason: 'no_patient_account_or_certificate',
      });
    }

    sendJson(res, 200, {
      message: 'If an account exists for this email, a reset link has been sent.',
    });
    return;
    } catch (errorObject) {
      error('patient.password_reset.request_failed', {
        email,
        message: errorObject?.message || String(errorObject),
      });
      sendJson(res, 200, {
        ok: false,
        message: 'If an account exists for this email, a reset link has been sent.',
      });
      return;
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/password/reset/confirm') {
    const body = await parseJsonBody(req);
    const token = String(body.token || '').trim();
    const nextPassword = String(body.password || body.newPassword || '');

    if (!token || !nextPassword) {
      sendJson(res, 400, { error: 'token and password are required' });
      return;
    }

    let account;
    try {
      account = await resetPasswordWithToken({
        token,
        newPassword: nextPassword,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      if (['TOKEN_INVALID', 'TOKEN_EXPIRED', 'ACCOUNT_NOT_FOUND'].includes(String(errorObject?.code || ''))) {
        sendJson(res, 400, { error: 'Invalid or expired reset token' });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'PATIENT_PASSWORD_RESET_COMPLETED',
      email: account.email,
    });

    const patientToken = issuePatientToken(account.email);
    sendJson(res, 200, {
      token: patientToken,
      patient: buildPatientIdentity({
        email: account.email,
        latestCertificate: null,
        account,
      }),
    });
    info('patient.password_reset.completed', { email: account.email });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/me') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const account = await getPatientAccountByEmail(patient.email);
    const certificates = await listCertificates();
    const billing = await resolvePatientBillingProfile(patient.email, certificates);
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);
    if (patientCertificates.length === 0 && !account) {
      sendJson(res, 404, { error: 'Patient account not found' });
      return;
    }

    const latest = patientCertificates[0] || null;
    if (latest?.certificateDraft) {
      await updatePatientAccountProfile({
        email: patient.email,
        fullName: latest.certificateDraft.fullName || '',
        dob: latest.certificateDraft.dob || '',
        phone: latest.certificateDraft.phone || '',
      });
    }

    sendJson(res, 200, {
      patient: buildPatientIdentity({
        email: patient.email,
        latestCertificate: latest,
        account,
      }),
      billing,
      queueCount: patientCertificates.filter((item) => isCertificateOpenForReview(item)).length,
      latestRequest: latest ? patientSummaryFromCertificate(latest) : null,
    });
    return;
  }

  if (!MEAL_PLAN_FEATURE_ENABLED && url.pathname.startsWith('/api/patient/meal-plan/')) {
    sendJson(res, 410, {
      ok: false,
      error: 'Meal planning is currently unavailable.',
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/meal-plan/catalog') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const requestedLimit = Math.round(Number(url.searchParams.get('limit') || 500));
    const limit = Math.max(50, Math.min(800, Number.isFinite(requestedLimit) ? requestedLimit : 500));
    const includeDataImages = ['1', 'true', 'yes'].includes(String(url.searchParams.get('includeDataImages') || '').toLowerCase());
    const maxDataImageLength = 320_000;
    const hasConcreteImage = (value) => {
      const urlValue = String(value || '').trim();
      if (!urlValue) return false;
      if (urlValue.startsWith('http://') || urlValue.startsWith('https://')) return true;
      if (!includeDataImages) return false;
      if (!/^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(urlValue)) return false;
      return urlValue.length <= maxDataImageLength;
    };

    try {
      let catalog = [];
      let catalogSource = 'persisted';
      try {
        catalog = await listMealPlannerRecipes();
      } catch (catalogError) {
        error('meal_plan.catalog_supabase_load_failed', {
          email: normalizeEmail(patient.email),
          message: catalogError?.message || String(catalogError),
        });
        catalogSource = 'local-fallback';
      }
      if (!Array.isArray(catalog) || catalog.length === 0) {
        catalog = await loadLocalFallbackRecipeCatalog();
        catalogSource = 'local-fallback';
      }

      const generatedCacheEntries = await listMealPlanGenerationCacheByPatientEmail(patient.email, 36).catch((cacheListError) => {
        error('meal_plan.catalog_cache_index_failed', {
          email: normalizeEmail(patient.email),
          message: cacheListError?.message || String(cacheListError),
        });
        return [];
      });
      const generatedRecipeIds = normalizeRecipeIdList(
        (Array.isArray(generatedCacheEntries) ? generatedCacheEntries : []).flatMap((entry) =>
          normalizeRecipeIdList(entry?.bundle?.recipeIds ?? entry?.bundle?.recipe_ids)
        )
      );
      if (generatedRecipeIds.length > 0) {
        const generatedRecipes = await listMealPlannerRecipesByIds(generatedRecipeIds).catch((cacheRecipeError) => {
          error('meal_plan.catalog_cache_recipe_lookup_failed', {
            email: normalizeEmail(patient.email),
            message: cacheRecipeError?.message || String(cacheRecipeError),
          });
          return [];
        });
        if (Array.isArray(generatedRecipes) && generatedRecipes.length > 0) {
          const mergedCatalog = new Map(
            (Array.isArray(catalog) ? catalog : [])
              .filter((recipe) => recipe && recipe.id)
              .map((recipe) => [String(recipe.id), recipe])
          );
          for (const recipe of generatedRecipes) {
            if (!recipe || !recipe.id) continue;
            mergedCatalog.set(String(recipe.id), recipe);
          }
          catalog = [...mergedCatalog.values()];
          if (catalogSource === 'local-fallback') {
            catalogSource = 'local+patient-generated';
          } else if (catalogSource === 'persisted') {
            catalogSource = 'persisted+patient-generated';
          }
        }
      }

      const recipes = (Array.isArray(catalog) ? catalog : [])
        .filter(
          (recipe) =>
            recipe &&
            typeof recipe === 'object' &&
            typeof recipe.id === 'string' &&
            typeof recipe.title === 'string' &&
            Array.isArray(recipe.ingredients) &&
            hasConcreteImage(recipe.imageUrl)
        )
        .slice(0, limit)
        .map((recipe) => ({
          ...recipe,
          imageUrl: String(recipe.imageUrl || '').trim(),
        }));

      sendJson(res, 200, {
        ok: true,
        count: recipes.length,
        recipes,
        catalogSource,
      });
    } catch (errorObject) {
      error('meal_plan.catalog_load_failed', {
        email: normalizeEmail(patient.email),
        message: errorObject?.message || String(errorObject),
      });
      sendJson(res, 200, {
        ok: true,
        count: 0,
        recipes: [],
        catalogSource: 'error-fallback',
      });
    }
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/meal-plan/latest') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const includeDataImages = ['1', 'true', 'yes'].includes(String(url.searchParams.get('includeDataImages') || '').toLowerCase());
    const maxDataImageLength = 320_000;
    const isHttpImage = (value) => /^https?:\/\//i.test(String(value || '').trim());
    const isPersistableDataImage = (value) => /^data:image\/(?:png|jpe?g|webp|gif|avif);base64,/i.test(String(value || '').trim());
    const sanitizeImage = (value) => {
      const candidate = String(value || '').trim();
      if (!candidate) return '';
      if (isHttpImage(candidate)) return candidate;
      if (includeDataImages && isPersistableDataImage(candidate) && candidate.length <= maxDataImageLength) {
        return candidate;
      }
      return '';
    };

    try {
      const latestEntry = await getLatestMealPlanGenerationCacheByPatientEmail(patient.email).catch((cacheError) => {
        error('meal_plan.latest_cache_lookup_failed', {
          email: normalizeEmail(patient.email),
          message: cacheError?.message || String(cacheError),
        });
        return null;
      });
      if (!latestEntry) {
        sendJson(res, 200, {
          ok: true,
          found: false,
          mealPlan: null,
          recipes: [],
        });
        return;
      }

      const hydrated = await hydrateMealPlanBundleFromCacheEntry(latestEntry).catch((hydrateError) => {
        error('meal_plan.latest_cache_hydrate_failed', {
          email: normalizeEmail(patient.email),
          message: hydrateError?.message || String(hydrateError),
        });
        return null;
      });
      if (!hydrated) {
        sendJson(res, 200, {
          ok: true,
          found: false,
          mealPlan: null,
          recipes: [],
        });
        return;
      }

      const recipes = (Array.isArray(hydrated.recipes) ? hydrated.recipes : []).map((recipe) => {
        const imageUrl = sanitizeImage(recipe?.imageUrl);
        const sourceImage = sanitizeImage(recipe?.source?.image_url || recipe?.source?.imageUrl);
        return {
          ...recipe,
          imageUrl: imageUrl || sourceImage || undefined,
        };
      });

      sendJson(res, 200, {
        ok: true,
        found: true,
        generatedBy: latestEntry.source || 'openai',
        stage: latestEntry.stage || 'ai_recipes_v3',
        mealPlan: hydrated.mealPlan,
        recipes,
        cachedAt: latestEntry.updatedAt || latestEntry.lastUsedAt || latestEntry.createdAt || null,
      });
    } catch (errorObject) {
      error('meal_plan.latest_load_failed', {
        email: normalizeEmail(patient.email),
        message: errorObject?.message || String(errorObject),
      });
      sendJson(res, 200, {
        ok: true,
        found: false,
        mealPlan: null,
        recipes: [],
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/meal-plan/generate') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const body = await parseJsonBody(req);
    const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
    const includeSnack = Boolean(body?.includeSnack);
    const seedSalt = String(body?.seedSalt || '').slice(0, 120);
    const bypassCache = Boolean(seedSalt);
    const cacheIdentity = buildMealPlanCacheIdentity({
      patientEmail: patient.email,
      answers,
      includeSnack,
    });
    try {
      if (!bypassCache) {
        const userCached = await getMealPlanGenerationCache(cacheIdentity.userCacheKey).catch((cacheError) => {
          error('meal_plan.cache_read_failed', {
            email: normalizeEmail(patient.email),
            cacheKey: cacheIdentity.userCacheKey,
            message: cacheError?.message || String(cacheError),
          });
          return null;
        });
        const hydratedUserCache = userCached ? await hydrateMealPlanBundleFromCacheEntry(userCached) : null;
        if (hydratedUserCache?.mealPlan && Array.isArray(hydratedUserCache.recipes) && hydratedUserCache.recipes.length > 0) {
          const cachedStage = String(userCached?.stage || 'ai_recipes_v3');
          const cachedGeneratedBy =
            String(userCached?.source || '').trim().toLowerCase() === 'rules' || cachedStage.startsWith('rules_')
              ? 'rules'
              : 'openai';
          sendJson(res, 200, {
            ok: true,
            generatedBy: cachedGeneratedBy,
            stage: cachedStage,
            mealPlan: hydratedUserCache.mealPlan,
            recipes: hydratedUserCache.recipes,
            intakeProfile: null,
            catalogSource: 'generated-cache-user',
            cached: true,
          });
          return;
        }
      }

      if (!bypassCache) {
        const sharedCached = await getMealPlanTemplateCacheByIntakeHash(cacheIdentity.intakeHash).catch((cacheError) => {
          error('meal_plan.template_cache_read_failed', {
            email: normalizeEmail(patient.email),
            intakeHash: cacheIdentity.intakeHash,
            message: cacheError?.message || String(cacheError),
          });
          return null;
        });
        const hydratedSharedCache = sharedCached ? await hydrateMealPlanBundleFromCacheEntry(sharedCached) : null;
        if (hydratedSharedCache?.mealPlan && Array.isArray(hydratedSharedCache.recipes) && hydratedSharedCache.recipes.length > 0) {
          const sharedCachedStage = String(sharedCached?.stage || 'ai_recipes_v3');
          const sharedCachedGeneratedBy =
            String(sharedCached?.source || '').trim().toLowerCase() === 'rules' || sharedCachedStage.startsWith('rules_')
              ? 'rules'
              : 'openai';
          sendJson(res, 200, {
            ok: true,
            generatedBy: sharedCachedGeneratedBy,
            stage: sharedCachedStage,
            mealPlan: hydratedSharedCache.mealPlan,
            recipes: hydratedSharedCache.recipes,
            intakeProfile: null,
            catalogSource: 'generated-cache-template',
            cached: true,
          });

          const assignedBundle = buildMealPlanCacheBundle({
            mealPlan: hydratedSharedCache.mealPlan,
            recipes: hydratedSharedCache.recipes,
          });
          if (assignedBundle) {
            void upsertMealPlanGenerationCache({
              cacheKey: cacheIdentity.userCacheKey,
              intakeHash: cacheIdentity.intakeHash,
              patientEmail: patient.email,
              source: 'openai',
              stage: 'ai_recipes_v3',
              bundle: assignedBundle,
            }).catch((persistError) => {
              error('meal_plan.cache_assign_from_template_failed', {
                email: normalizeEmail(patient.email),
                cacheKey: cacheIdentity.userCacheKey,
                message: persistError?.message || String(persistError),
              });
            });
          }
          return;
        }
      }
      const { generateOpenAiMealPlanWithGeneratedRecipes } = await loadMealPlanAiModule();
      const generatedBundle = await generateOpenAiMealPlanWithGeneratedRecipes({
        answers,
        includeSnack,
        seedSalt,
      });
      let resolvedBundle = generatedBundle;
      let generatedBy = 'openai';
      let stage = 'ai_recipes_v3';
      let catalogSource = 'generated';

      if (!resolvedBundle) {
        let fallbackCatalog = await listMealPlannerRecipes().catch((fallbackError) => {
          error('meal_plan.rules_fallback_catalog_failed', {
            email: normalizeEmail(patient.email),
            message: fallbackError?.message || String(fallbackError),
          });
          return [];
        });
        if (!Array.isArray(fallbackCatalog) || fallbackCatalog.length === 0) {
          fallbackCatalog = await loadLocalFallbackRecipeCatalog();
        }
        const fallbackBundle = await buildRuleFallbackBundleFromCatalog({
          recipes: fallbackCatalog,
          answers,
          includeSnack,
          seedSalt,
        });
        if (fallbackBundle) {
          resolvedBundle = fallbackBundle;
          generatedBy = 'rules';
          stage = 'rules_fallback_v1';
          catalogSource = 'rules-fallback';
          info('meal_plan.rules_fallback_used', {
            email: normalizeEmail(patient.email),
            filteredRecipeCount: fallbackBundle.filteredRecipeCount,
            totalRecipeCount: fallbackBundle.totalRecipeCount,
          });
        }
      }

      if (!resolvedBundle) {
        sendJson(res, 200, {
          ok: false,
          generatedBy: 'openai',
          stage: 'ai_recipes_v3',
          error: 'Unable to generate meals from the provided onboarding preferences.',
        });
        return;
      }
      sendJson(res, 200, {
        ok: true,
        generatedBy,
        stage,
        mealPlan: resolvedBundle.mealPlan,
        recipes: resolvedBundle.recipes,
        intakeProfile: resolvedBundle.intakeProfile || null,
        catalogSource,
        cached: false,
      });

      const bundlePayload = buildMealPlanCacheBundle({
        mealPlan: resolvedBundle.mealPlan,
        recipes: resolvedBundle.recipes,
      });
      const shouldWriteTemplateCache = generatedBy === 'openai';
      void Promise.all([
        upsertMealPlannerRecipes(resolvedBundle.recipes),
        ...(bundlePayload
          ? [
              upsertMealPlanGenerationCache({
                cacheKey: cacheIdentity.userCacheKey,
                intakeHash: cacheIdentity.intakeHash,
                patientEmail: patient.email,
                source: generatedBy,
                stage,
                bundle: bundlePayload,
              }),
              ...(shouldWriteTemplateCache
                ? [
                    upsertMealPlanGenerationCache({
                      cacheKey: cacheIdentity.templateCacheKey,
                      intakeHash: cacheIdentity.intakeHash,
                      patientEmail: 'mealplan-template@onyahealth.local',
                      source: generatedBy,
                      stage,
                      bundle: bundlePayload,
                    }),
                  ]
                : []),
            ]
          : []),
      ]).catch((persistError) => {
        error('meal_plan.cache_write_failed', {
          email: normalizeEmail(patient.email),
          cacheKey: cacheIdentity.userCacheKey,
          message: persistError?.message || String(persistError),
        });
      });
    } catch (errorObject) {
      console.error('AI meal planner generation failed:', errorObject?.message || String(errorObject));
      sendJson(res, 503, {
        ok: false,
        generatedBy: 'openai',
        stage: 'ai_recipes_v3',
        error: 'Unable to generate meals right now.',
      });
    }
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/billing/portal') {
    const patient = await requirePatient(req, res);
    if (!patient) return;
    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe billing is not configured on the server' });
      return;
    }

    const body = await parseJsonBody(req);
    const requestedReturnUrl = String(body?.returnUrl || body?.return_url || '').trim();
    const fallbackReturnUrl = buildStripeBillingReturnUrl();
    const safeReturnUrl =
      requestedReturnUrl.startsWith('https://') || requestedReturnUrl.startsWith('http://')
        ? requestedReturnUrl
        : fallbackReturnUrl;

    const certificates = await listCertificates();
    const billing = await resolvePatientBillingProfile(patient.email, certificates);
    if (!billing.stripeCustomerId) {
      sendJson(res, 409, {
        error: 'No Stripe billing profile found for this patient account.',
        code: 'BILLING_NOT_FOUND',
      });
      return;
    }

    const portal = await createStripeBillingPortalSession(billing.stripeCustomerId, safeReturnUrl);
    sendJson(res, 200, {
      url: portal?.url || null,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/patient/subscription/cancel') {
    const patient = await requirePatient(req, res);
    if (!patient) return;
    if (!isStripeEnabled()) {
      sendJson(res, 500, { error: 'Stripe billing is not configured on the server' });
      return;
    }

    const certificates = await listCertificates();
    const billing = await resolvePatientBillingProfile(patient.email, certificates);
    if (!billing.stripeSubscriptionId) {
      sendJson(res, 409, {
        error: 'No active unlimited subscription was found.',
        code: 'SUBSCRIPTION_NOT_FOUND',
      });
      return;
    }

    const updatedSubscription = await cancelStripeSubscriptionAtPeriodEnd(billing.stripeSubscriptionId);
    try {
      await syncPatientBillingFromStripeSubscription(updatedSubscription, {
        source: 'stripe.patient_cancel',
        fallbackPatientEmail: normalizeEmail(patient.email),
      });
    } catch (billingSyncError) {
      error('patient.billing.sync_after_cancel_failed', {
        patientEmail: normalizeEmail(patient.email),
        stripeSubscriptionId: billing.stripeSubscriptionId,
        message: billingSyncError?.message || String(billingSyncError),
      });
    }
    const refreshedBilling = await resolvePatientBillingProfile(patient.email, certificates);

    await appendAudit({
      type: 'PATIENT_SUBSCRIPTION_CANCEL_AT_PERIOD_END',
      email: normalizeEmail(patient.email),
      stripeSubscriptionId: billing.stripeSubscriptionId,
    });

    sendJson(res, 200, {
      ok: true,
      subscriptionStatus: normalizeStripeSubscriptionStatus(updatedSubscription?.status || ''),
      cancelAtPeriodEnd: Boolean(updatedSubscription?.cancel_at_period_end),
      currentPeriodEnd: unixSecondsToIso(updatedSubscription?.current_period_end),
      billing: refreshedBilling,
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/patient/requests') {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certificates = await listCertificates();
    const patientCertificates = getPatientCertificatesForEmail(certificates, patient.email);

    sendJson(res, 200, {
      count: patientCertificates.length,
      requests: patientCertificates.map(patientSummaryFromCertificate),
    });
    return;
  }

  const patientRequestMatch = url.pathname.match(/^\/api\/patient\/requests\/([^/]+)$/);
  if (req.method === 'GET' && patientRequestMatch) {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certId = decodeURIComponent(patientRequestMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Request not found' });
      return;
    }
    if (normalizeEmail(certificate?.certificateDraft?.email) !== normalizeEmail(patient.email)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    sendJson(res, 200, {
      request: patientSummaryFromCertificate(certificate),
      certificateDraft: certificate.certificateDraft || {},
    });
    return;
  }

  const patientMessageMatch = url.pathname.match(/^\/api\/patient\/requests\/([^/]+)\/message$/);
  if (req.method === 'POST' && patientMessageMatch) {
    const patient = await requirePatient(req, res);
    if (!patient) return;

    const certId = decodeURIComponent(patientMessageMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Request not found' });
      return;
    }
    if (normalizeEmail(certificate?.certificateDraft?.email) !== normalizeEmail(patient.email)) {
      sendJson(res, 403, { error: 'Forbidden' });
      return;
    }

    const body = await parseJsonBody(req);
    const message = String(body.message || '').trim();
    if (!message) {
      sendJson(res, 400, { error: 'Message is required' });
      return;
    }

    await appendAudit({
      type: 'PATIENT_MESSAGE_SENT',
      certificateId: certId,
      by: normalizeEmail(patient.email),
      message,
    });

    const recipients = await resolveDoctorNotificationEmails();
    const patientMessageEmail = renderDoctorPatientMessageEmail({
      baseUrl: getFrontendBaseUrl(),
      certId,
      patientEmail: normalizeEmail(patient.email),
      message,
    });

    let emailSent = false;
    try {
      await sendEmail({
        to: recipients,
        subject: `Patient message for request ${certId}`,
        html: patientMessageEmail.html,
        text: patientMessageEmail.text,
      });
      emailSent = true;
    } catch (errorObject) {
      error('patient.message.email_failed', {
        certificateId: certId,
        patientEmail: normalizeEmail(patient.email),
        message: errorObject?.message || String(errorObject),
      });
    }

    info('patient.message.sent', {
      certificateId: certId,
      patientEmail: normalizeEmail(patient.email),
      provider: currentEmailProvider(),
      recipients,
      emailSent,
    });

    sendJson(res, 200, {
      message: emailSent ? 'Message sent to doctor' : 'Message saved; doctor notification email is pending',
      emailSent,
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/register') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');
    const fullName = String(body.fullName || body.name || '').trim();
    const providerType = String(body.providerType || body.provider || '').trim();
    const registrationNumber = String(
      body.registrationNumber || body.providerRegistration || body.registration || ''
    )
      .trim()
      .toUpperCase();
    const providerNumber = normalizeProviderNumber(body.providerNumber || body.medicareProviderNumber || '');

    if (!isLikelyDoctorEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }
    if (!providerType) {
      sendJson(res, 400, { error: 'Provider type is required' });
      return;
    }
    if (!registrationNumber) {
      sendJson(res, 400, { error: 'Registration number is required' });
      return;
    }

    let account;
    try {
      account = await createDoctorAccount({
        email,
        password,
        fullName,
        providerType,
        registrationNumber,
        providerNumber,
        approvalStatus: 'pending',
        source: 'portal-signup',
      });
    } catch (errorObject) {
      if (errorObject?.code === 'ACCOUNT_EXISTS') {
        sendJson(res, 409, { error: 'Doctor account already exists' });
        return;
      }
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'DOCTOR_ACCOUNT_CREATED',
      email,
      approvalStatus: 'pending',
    });

    try {
      const welcomeEmail = renderDoctorWelcomeEmail({
        baseUrl: getFrontendBaseUrl(),
        fullName: account.fullName || fullName,
      });
      await sendEmail({
        to: email,
        subject: 'Welcome to the Onya doctor portal',
        html: welcomeEmail.html,
        text: welcomeEmail.text,
      });
    } catch (errorObject) {
      error('doctor.register.welcome_email_failed', {
        email,
        message: errorObject?.message || String(errorObject),
      });
    }

    info('doctor.register.success', { email });
    sendJson(res, 201, {
      approvalRequired: true,
      doctor: {
        email,
        name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: account.providerType || providerType,
        registrationNumber: account.registrationNumber || registrationNumber,
        providerNumber: account.providerNumber || providerNumber,
        approvalStatus: account.approvalStatus || 'pending',
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/password/reset/request') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);

    if (!isLikelyDoctorEmail(email)) {
      sendJson(res, 400, { error: 'A valid email is required' });
      return;
    }

    const resetPayload = await issueDoctorPasswordResetToken(email, DOCTOR_PASSWORD_RESET_TTL_MS);
    if (resetPayload) {
      const resetUrl = buildDoctorPasswordResetUrl(resetPayload.token);
      const resetEmail = renderDoctorPasswordResetEmail({
        baseUrl: getFrontendBaseUrl(),
        resetUrl,
        expiresMinutes: String(Math.round(DOCTOR_PASSWORD_RESET_TTL_MS / (1000 * 60))),
      });
      try {
        await sendEmail({
          to: email,
          subject: 'Reset your doctor portal password',
          html: resetEmail.html,
          text: resetEmail.text,
        });
        await appendAudit({
          type: 'DOCTOR_PASSWORD_RESET_REQUESTED',
          email,
        });
      } catch (errorObject) {
        error('doctor.password_reset.dispatch_failed', {
          email,
          message: errorObject?.message || String(errorObject),
        });
      }
      info('doctor.password_reset.requested', {
        email,
        provider: currentEmailProvider(),
      });
    }

    sendJson(res, 200, {
      message: 'If an account exists for this email, a reset link has been sent.',
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/password/reset/confirm') {
    const body = await parseJsonBody(req);
    const token = String(body.token || '').trim();
    const nextPassword = String(body.password || body.newPassword || '');

    if (!token || !nextPassword) {
      sendJson(res, 400, { error: 'token and password are required' });
      return;
    }

    let account;
    try {
      account = await resetDoctorPasswordWithToken({
        token,
        newPassword: nextPassword,
      });
    } catch (errorObject) {
      if (errorObject?.code === 'PASSWORD_INVALID') {
        sendJson(res, 400, { error: errorObject.message });
        return;
      }
      if (['TOKEN_INVALID', 'TOKEN_EXPIRED', 'ACCOUNT_NOT_FOUND'].includes(String(errorObject?.code || ''))) {
        sendJson(res, 400, { error: 'Invalid or expired reset token' });
        return;
      }
      throw errorObject;
    }

    await appendAudit({
      type: 'DOCTOR_PASSWORD_RESET_COMPLETED',
      email: account.email,
    });

    info('doctor.password_reset.completed', { email: account.email });
    if (!doctorProfileHasApproval(account, account.email)) {
      sendJson(res, 200, {
        approvalRequired: true,
        message: 'Password updated. Your doctor account still needs admin approval before portal access.',
        doctor: {
          email: account.email,
          name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
          providerType: account.providerType || '',
          registrationNumber: account.registrationNumber || '',
          providerNumber: account.providerNumber || '',
          approvalStatus: account.approvalStatus || 'pending',
        },
      });
      return;
    }

    const tokenValue = issueDoctorToken(account.email);
    sendJson(res, 200, {
      token: tokenValue,
      doctor: {
        email: account.email,
        name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: account.providerType || '',
        registrationNumber: account.registrationNumber || '',
        providerNumber: account.providerNumber || '',
        approvalStatus: account.approvalStatus || 'approved',
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/login') {
    const body = await parseJsonBody(req);
    const email = normalizeEmail(body.email);
    const password = String(body.password || '');

    let doctorIdentity = null;
    let pendingApproval = false;
    if (validateDoctorCredentials(email, password)) {
      doctorIdentity = {
        email,
        name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        providerType: '',
        registrationNumber: '',
        providerNumber: '',
        approvalStatus: 'approved',
      };
    } else {
      const account = await authenticateDoctorAccount({ email, password });
      if (account?.email) {
        if (!doctorProfileHasApproval(account, account.email)) {
          pendingApproval = true;
        } else {
          doctorIdentity = {
            email: account.email,
            name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
            providerType: account.providerType || '',
            registrationNumber: account.registrationNumber || '',
            providerNumber: account.providerNumber || '',
            approvalStatus: account.approvalStatus || 'approved',
          };
        }
      }
    }

    if (!doctorIdentity) {
      if (pendingApproval) {
        sendJson(res, 403, { error: 'Doctor account is pending admin approval.' });
        return;
      }
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = issueDoctorToken(doctorIdentity.email);
    info('doctor.login.success', { email: doctorIdentity.email });
    sendJson(res, 200, {
      token,
      doctor: {
        email: doctorIdentity.email,
        name: doctorIdentity.name,
        providerType: doctorIdentity.providerType || '',
        registrationNumber: doctorIdentity.registrationNumber || '',
        providerNumber: doctorIdentity.providerNumber || '',
        approvalStatus: doctorIdentity.approvalStatus || 'approved',
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/doctor/profile') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const profile = await resolveDoctorProfile(doctor.email);
    sendJson(res, 200, {
      doctor: {
        email: normalizeEmail(doctor.email),
        fullName: String(profile?.fullName || '').trim(),
        providerType: String(profile?.providerType || '').trim(),
        registrationNumber: String(profile?.registrationNumber || '').trim().toUpperCase(),
        providerNumber: normalizeProviderNumber(profile?.providerNumber || ''),
        approvalStatus: profile?.approvalStatus || (isDoctorAdminEmail(doctor.email) ? 'approved' : 'pending'),
      },
    });
    return;
  }

  if (req.method === 'POST' && url.pathname === '/api/doctor/profile') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const body = await parseJsonBody(req);
    const fullName = String(body.fullName || body.name || '').trim();
    const providerType = String(body.providerType || body.provider || '').trim();
    const registrationNumber = String(
      body.registrationNumber || body.providerRegistration || body.registration || ''
    )
      .trim()
      .toUpperCase();
    const providerNumber = normalizeProviderNumber(body.providerNumber || body.medicareProviderNumber || '');

    if (!providerType) {
      sendJson(res, 400, { error: 'Provider type is required' });
      return;
    }
    if (!registrationNumber) {
      sendJson(res, 400, { error: 'Registration number is required' });
      return;
    }

    const updated = await upsertDoctorAccount({
      email: normalizeEmail(doctor.email),
      fullName,
      providerType,
      registrationNumber,
      providerNumber,
      source: 'portal-profile',
    });

    sendJson(res, 200, {
      doctor: {
        email: normalizeEmail(doctor.email),
        fullName: String(updated?.fullName || fullName || '').trim(),
        providerType: String(updated?.providerType || providerType || '').trim(),
        registrationNumber: String(
          updated?.registrationNumber || registrationNumber || ''
        )
          .trim()
          .toUpperCase(),
        providerNumber: normalizeProviderNumber(updated?.providerNumber || providerNumber || ''),
        approvalStatus: updated?.approvalStatus || 'approved',
      },
    });
    return;
  }

  const doctorApprovalMatch = url.pathname.match(/^\/api\/doctor\/accounts\/([^/]+)\/approval$/);
  if (req.method === 'POST' && doctorApprovalMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;
    if (!isDoctorAdminEmail(doctor.email)) {
      sendJson(res, 403, { error: 'Only an admin doctor can approve doctor accounts.' });
      return;
    }

    const targetEmail = normalizeEmail(decodeURIComponent(doctorApprovalMatch[1] || ''));
    const body = await parseJsonBody(req);
    const requestedApprovalStatus = String(body.approvalStatus || body.status || '').trim().toLowerCase();
    if (!['approved', 'pending', 'rejected'].includes(requestedApprovalStatus)) {
      sendJson(res, 400, { error: 'approvalStatus must be approved, pending, or rejected' });
      return;
    }
    const approvalStatus = normalizeApprovalStatus(requestedApprovalStatus);
    const providerNumber = normalizeProviderNumber(body.providerNumber || body.medicareProviderNumber || '');
    if (!targetEmail) {
      sendJson(res, 400, { error: 'Doctor email is required' });
      return;
    }

    const account = await getDoctorAccountByEmail(targetEmail);
    if (!account?.email) {
      sendJson(res, 404, { error: 'Doctor account not found' });
      return;
    }

    const updated = await setDoctorAccountApprovalStatus({
      email: targetEmail,
      approvalStatus,
      providerNumber,
    });

    await appendAudit({
      type: 'DOCTOR_ACCOUNT_APPROVAL_UPDATED',
      email: targetEmail,
      by: normalizeEmail(doctor.email),
      approvalStatus,
    });

    sendJson(res, 200, {
      doctor: {
        email: updated?.email || targetEmail,
        fullName: updated?.fullName || '',
        providerType: updated?.providerType || '',
        registrationNumber: updated?.registrationNumber || '',
        providerNumber: updated?.providerNumber || '',
        approvalStatus: updated?.approvalStatus || approvalStatus,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === '/api/doctor/certificates') {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const statusFilter = url.searchParams.get('status');
    const items = await listCertificates();

    const filtered = items
      .filter((item) => {
        if (isOpenForReview(item.status) && !isCertificateOpenForReview(item)) {
          return false;
        }
        if (!statusFilter) return true;
        if (statusFilter === 'pending') {
          return isCertificateOpenForReview(item);
        }
        return item.status === statusFilter;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        serviceType: item.serviceType,
        patientName: item.certificateDraft.fullName,
        verificationCode: getCertificateVerificationCode(item),
        risk: item.risk,
      }));

    sendJson(res, 200, {
      doctor: doctor.email,
      count: filtered.length,
      certificates: filtered,
    });
    info('doctor.queue.loaded', {
      doctor: doctor.email,
      statusFilter: statusFilter || 'all',
      count: filtered.length,
    });
    return;
  }

  const certificateIdMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)$/);
  if (req.method === 'GET' && certificateIdMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(certificateIdMatch[1]);
    const certificate = await getCertificateById(certId);

    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    sendJson(res, 200, {
      doctor: doctor.email,
      certificate: doctorPayloadFromRequest(certificate),
    });
    return;
  }

  const autoNotesMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/auto-notes$/);
  if (req.method === 'POST' && autoNotesMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(autoNotesMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const notes = await generateDoctorNotes(certificate, doctor.email);
    info('doctor.notes.generated', {
      doctor: doctor.email,
      certificateId: certId,
      mode: 'auto-summary',
    });
    sendJson(res, 200, { notes });
    return;
  }

  const moreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/more-info$/);
  if (req.method === 'POST' && moreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(moreInfoMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const notes = await generateMoreInfoDraft(certificate);
    info('doctor.notes.generated', {
      doctor: doctor.email,
      certificateId: certId,
      mode: 'more-info-draft',
    });
    sendJson(res, 200, { notes });
    return;
  }

  const previewMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/pdf-preview$/);
  if (req.method === 'POST' && previewMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    if (!doctorProfile?.providerType || !doctorProfile?.registrationNumber) {
      sendJson(res, 400, {
        error: 'Please complete provider type and registration number in your doctor profile first.',
      });
      return;
    }
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

    const certId = decodeURIComponent(previewMatch[1]);
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    const previewCertificate = {
      ...certificate,
      decision: {
        ...(certificate.decision || {}),
        by: reviewerName,
        byEmail: normalizeEmail(doctor.email),
        providerType: String(doctorProfile?.providerType || '').trim(),
        registrationNumber: String(doctorProfile?.registrationNumber || '')
          .trim()
          .toUpperCase(),
        at: new Date().toISOString(),
        notes,
      },
    };

    const pdfBuffer = await buildCertificatePdf(previewCertificate, {
      doctorName: reviewerName,
      doctorNotes: notes,
      providerType: String(previewCertificate?.decision?.providerType || '').trim(),
      registrationNumber: String(previewCertificate?.decision?.registrationNumber || '')
        .trim()
        .toUpperCase(),
      verificationCode: getCertificateVerificationCode(previewCertificate),
      verifyUrl: `${getFrontendBaseUrl()}/verify?code=${encodeURIComponent(getCertificateVerificationCode(previewCertificate))}`,
      isPreview: true,
    });
    info('doctor.pdf.preview.generated', {
      doctor: doctor.email,
      certificateId: certId,
      bytes: pdfBuffer.length,
    });

    setCors(res);
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
    res.end(pdfBuffer);
    return;
  }

  const requestMoreInfoMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/request-more-info$/);
  if (req.method === 'POST' && requestMoreInfoMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

    const certId = decodeURIComponent(requestMoreInfoMatch[1]);
    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();

    if (!notes) {
      sendJson(res, 400, { error: 'Please add notes before requesting more information' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isCertificateOpenForReview(currentCertificate)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => ({
      ...current,
      status: 'in_review',
      decision: {
        ...(current.decision || {}),
        by: reviewerName,
        byEmail: normalizeEmail(doctor.email),
        providerType: String(doctorProfile?.providerType || '').trim(),
        registrationNumber: String(doctorProfile?.registrationNumber || '')
          .trim()
          .toUpperCase(),
        at: new Date().toISOString(),
        notes,
      },
    }));

    if (!updated) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    await appendAudit({
      type: 'MORE_INFO_REQUESTED',
      certificateId: updated.id,
      by: doctor.email,
      notes,
    });
    await sendPatientMoreInfoEmail(updated, doctor.email, notes);
    info('doctor.more_info.requested', {
      doctor: doctor.email,
      certificateId: updated.id,
    });

    sendJson(res, 200, {
      message: 'More information request sent to patient',
      certificate: doctorPayloadFromRequest(updated),
    });
    return;
  }

  const decisionMatch = url.pathname.match(/^\/api\/doctor\/certificates\/([^/]+)\/decision$/);
  if (req.method === 'POST' && decisionMatch) {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;
    const doctorProfile = await resolveDoctorProfile(doctor.email);
    if (!doctorProfile?.providerType || !doctorProfile?.registrationNumber) {
      sendJson(res, 400, {
        error: 'Please complete provider type and registration number in your doctor profile first.',
      });
      return;
    }
    const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

    const certId = decodeURIComponent(decisionMatch[1]);
    const body = await parseJsonBody(req);
    const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null;
    const notes = String(body.notes || '').trim();

    if (!decision) {
      sendJson(res, 400, { error: 'Decision must be approved or denied' });
      return;
    }

    const currentCertificate = await getCertificateById(certId);
    if (!currentCertificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }
    if (!isCertificateOpenForReview(currentCertificate)) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: currentCertificate.status,
      });
      return;
    }

    const updated = await updateCertificate(certId, (current) => {
      if (!isCertificateOpenForReview(current)) {
        return current;
      }

      return {
        ...current,
        status: decision,
        decision: {
          by: reviewerName,
          byEmail: normalizeEmail(doctor.email),
          providerType: String(doctorProfile?.providerType || '').trim(),
          registrationNumber: String(doctorProfile?.registrationNumber || '')
            .trim()
            .toUpperCase(),
          at: new Date().toISOString(),
          notes,
          result: decision,
        },
      };
    });

    if (!updated) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    if (updated.status !== decision) {
      sendJson(res, 409, {
        error: 'Certificate already reviewed',
        status: updated.status,
      });
      return;
    }

    await appendAudit({
      type: 'CERTIFICATE_REVIEWED',
      certificateId: updated.id,
      decision,
      by: doctor.email,
    });
    let patientNotificationFailed = false;
    try {
      await sendPatientDecisionEmail(updated);
    } catch (errorObject) {
      patientNotificationFailed = true;
      error('doctor.decision.patient_email_failed', {
        doctor: doctor.email,
        certificateId: updated.id,
        decision,
        message: errorObject?.message || String(errorObject),
      });
    }
    info('doctor.decision.submitted', {
      doctor: doctor.email,
      certificateId: updated.id,
      decision,
    });

    sendJson(res, 200, {
      message: patientNotificationFailed
        ? `Certificate ${decision}. Patient email delivery failed; please check email provider logs.`
        : `Certificate ${decision}`,
      certificate: doctorPayloadFromRequest(updated),
      patientNotificationFailed,
    });
    return;
  }

  sendJson(res, 404, { error: 'Not found' });
}

async function servePortalFile(res, fileName) {
  const filePath = path.join(PORTAL_DIR, fileName);
  const html = await fs.readFile(filePath, 'utf8');
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end(html);
}

async function handlePortal(req, res, url) {
  if (req.method !== 'GET') {
    sendText(res, 404, 'Not found');
    return;
  }

  if (url.pathname === '/doctor' || url.pathname === '/doctor/login') {
    await servePortalFile(res, 'login.html');
    return;
  }

  if (url.pathname === '/doctor/queue') {
    await servePortalFile(res, 'queue.html');
    return;
  }

  if (url.pathname === '/doctor/review') {
    await servePortalFile(res, 'review.html');
    return;
  }

  sendText(res, 404, 'Not found');
}

const server = http.createServer(async (req, res) => {
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  res.on('finish', () => {
    info('http.request.completed', {
      requestId,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
      ip: req.socket?.remoteAddress || null,
    });
  });

  try {
    const base = `http://${req.headers.host || 'localhost'}`;
    const url = new URL(req.url || '/', base);

    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
      return;
    }

    await handlePortal(req, res, url);
  } catch (errorObject) {
    error('http.request.unhandled_error', {
      requestId,
      method: req.method,
      url: req.url,
      message: errorObject?.message || String(errorObject),
      stack: errorObject?.stack || null,
    });
    sendJson(res, 500, { error: 'Internal server error' });
  }
});

server.listen(PORT, () => {
  info('server.started', {
    appBaseUrl: APP_BASE_URL,
    doctorPortalLogin: `${APP_BASE_URL}/doctor/login`,
    storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
    emailProvider: currentEmailProvider(),
    logFile: process.env.BACKEND_LOG_FILE || path.resolve(process.cwd(), 'backend', 'data', 'backend.log'),
  });
});
