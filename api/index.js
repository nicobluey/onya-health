import crypto from 'node:crypto';

import {
  issueDoctorToken,
  issuePatientToken,
  validateDoctorCredentials,
  verifyDoctorToken,
  verifyPatientToken,
} from '../backend/lib/auth.js';
import {
  authenticatePatientAccount,
  createPatientAccount,
  getPatientAccountByEmail,
  isLikelyEmail as isLikelyPatientEmail,
  issuePasswordResetToken,
  resetPasswordWithToken,
  updatePatientAccountProfile,
  validatePassword as validatePatientPassword,
} from '../backend/lib/patient-auth.js';
import {
  authenticateDoctorAccount,
  createDoctorAccount,
  getDoctorAccountByEmail,
  isLikelyEmail as isLikelyDoctorEmail,
  issueDoctorPasswordResetToken,
  listDoctorEmails,
  resetDoctorPasswordWithToken,
  upsertDoctorAccount,
} from '../backend/lib/doctor-auth.js';
import { calculateRisk } from '../backend/lib/risk.js';
import { buildCertificatePdf } from '../backend/lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from '../backend/lib/notes.js';
import {
  appendAudit,
  createCertificate,
  getCertificateById,
  getPatientBillingByEmail,
  isSupabaseStorageEnabled,
  listCertificates,
  listCertificatesByPatientEmail,
  upsertPatientBillingByEmail,
  updateCertificate,
} from '../backend/lib/storage.js';
import { currentEmailProvider, sendEmail } from '../backend/lib/email.js';
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
} from '../backend/lib/email-templates.js';
import { error, info } from '../backend/lib/logger.js';
import {
  getLatestPatientSnapshot,
  getPatientCertificatesForEmail,
  syncPatientProfileFromLatest,
} from './lib/patient-snapshot.js';

const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '*').trim();
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

const DOCTOR_NOTIFICATION_EMAILS_CONFIGURED = (process.env.DOCTOR_NOTIFICATION_EMAILS || 'doctor@onyahealth.com')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

const STRIPE_SECRET_KEY = String(process.env.STRIPE_SECRET_KEY || '');
const STRIPE_WEBHOOK_SECRET = String(process.env.STRIPE_WEBHOOK_SECRET || '');
const STRIPE_PRICE_PRODUCT_SINGLE_DAY = process.env.STRIPE_PRICE_PRODUCT_SINGLE_DAY || 'prod_U3xUNjNVkYYxdi';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';
const CERTIFICATE_TIME_ZONE = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 1121);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2711);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1917);
const STRIPE_AMOUNT_CARER_CERT_AUD_CENTS = Math.max(
  0,
  Number(process.env.STRIPE_AMOUNT_CARER_CERT_AUD_CENTS || 1000)
);
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
const PATIENT_PASSWORD_RESET_SIGNING_SECRET =
  process.env.PATIENT_PASSWORD_RESET_SIGNING_SECRET ||
  process.env.PATIENT_SESSION_SECRET ||
  process.env.DOCTOR_SESSION_SECRET ||
  'change-this-patient-reset-secret';
const PATIENT_SUPABASE_RESET_METADATA_KEY = 'onya_patient_password_reset';
const DOCTOR_PASSWORD_RESET_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.DOCTOR_PASSWORD_RESET_TTL_MS || 1000 * 60 * 60)
);
const DOCTOR_PASSWORD_RESET_PATH = process.env.DOCTOR_PASSWORD_RESET_PATH || '/doctor/login';

const OPEN_REVIEW_STATUSES = new Set(['pending', 'submitted', 'triaged', 'assigned', 'in_review']);
const ACTIVE_STRIPE_SUBSCRIPTION_STATUSES = new Set(['active', 'trialing', 'past_due']);
const POST_ONLY_ROUTES = new Set([
  'patient/password/reset/request',
  'patient/password/reset/confirm',
  'doctor/password/reset/request',
  'doctor/password/reset/confirm',
]);

const stripeSubscriptionCache = new Map();
const CHECKOUT_TIMING_WINDOW_SIZE = Math.max(
  20,
  Number(process.env.CHECKOUT_TIMING_WINDOW_SIZE || 200)
);
const checkoutTimingWindows = {
  total: [],
  stripe: [],
  persistence: [],
};

function normalizeDurationMs(value) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) return null;
  return Math.round(numberValue * 10) / 10;
}

function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) return null;
  if (values.length === 1) return values[0];
  const rank = (p / 100) * (values.length - 1);
  const lowerIndex = Math.floor(rank);
  const upperIndex = Math.ceil(rank);
  const lower = values[lowerIndex];
  const upper = values[upperIndex];
  if (lowerIndex === upperIndex) return lower;
  const weight = rank - lowerIndex;
  return lower + (upper - lower) * weight;
}

function recordCheckoutTimingSample({ totalMs, stripeMs = null, persistenceMs = null }) {
  const totalNormalized = normalizeDurationMs(totalMs);
  if (totalNormalized != null) {
    checkoutTimingWindows.total.push(totalNormalized);
    if (checkoutTimingWindows.total.length > CHECKOUT_TIMING_WINDOW_SIZE) {
      checkoutTimingWindows.total.shift();
    }
  }

  const stripeNormalized = normalizeDurationMs(stripeMs);
  if (stripeNormalized != null) {
    checkoutTimingWindows.stripe.push(stripeNormalized);
    if (checkoutTimingWindows.stripe.length > CHECKOUT_TIMING_WINDOW_SIZE) {
      checkoutTimingWindows.stripe.shift();
    }
  }

  const persistenceNormalized = normalizeDurationMs(persistenceMs);
  if (persistenceNormalized != null) {
    checkoutTimingWindows.persistence.push(persistenceNormalized);
    if (checkoutTimingWindows.persistence.length > CHECKOUT_TIMING_WINDOW_SIZE) {
      checkoutTimingWindows.persistence.shift();
    }
  }

  const totalSorted = [...checkoutTimingWindows.total].sort((a, b) => a - b);
  const stripeSorted = [...checkoutTimingWindows.stripe].sort((a, b) => a - b);
  const persistenceSorted = [...checkoutTimingWindows.persistence].sort((a, b) => a - b);

  return {
    windowSize: CHECKOUT_TIMING_WINDOW_SIZE,
    totalSamples: checkoutTimingWindows.total.length,
    stripeSamples: checkoutTimingWindows.stripe.length,
    persistenceSamples: checkoutTimingWindows.persistence.length,
    totalP50Ms: normalizeDurationMs(percentile(totalSorted, 50)),
    totalP95Ms: normalizeDurationMs(percentile(totalSorted, 95)),
    stripeP50Ms: normalizeDurationMs(percentile(stripeSorted, 50)),
    stripeP95Ms: normalizeDurationMs(percentile(stripeSorted, 95)),
    persistenceP50Ms: normalizeDurationMs(percentile(persistenceSorted, 50)),
    persistenceP95Ms: normalizeDurationMs(percentile(persistenceSorted, 95)),
  };
}

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
  res.status(statusCode).json(payload);
}

function getRequestBaseUrl(req) {
  const protocol = String(req.headers['x-forwarded-proto'] || 'https');
  const host = String(req.headers.host || '');
  if (!host) return 'http://localhost:3000';
  return `${protocol}://${host}`;
}

function getFrontendBaseUrl(req) {
  if (FRONTEND_BASE_URL) return FRONTEND_BASE_URL;
  return getRequestBaseUrl(req);
}

function getAppBaseUrl(req) {
  if (APP_BASE_URL) return APP_BASE_URL;
  return getRequestBaseUrl(req);
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function buildPatientPasswordResetUrl(req, token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(PATIENT_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  return `${getFrontendBaseUrl(req)}${pathSegment}?token=${encodedToken}`;
}

function buildDoctorPasswordResetUrl(req, token) {
  const encodedToken = encodeURIComponent(String(token || '').trim());
  const configuredPath = String(DOCTOR_PASSWORD_RESET_PATH || '').trim();

  if (configuredPath.startsWith('https://') || configuredPath.startsWith('http://')) {
    const joiner = configuredPath.includes('?') ? '&' : '?';
    return `${configuredPath}${joiner}token=${encodedToken}`;
  }

  const pathSegment = configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`;
  const baseUrl = getAppBaseUrl(req);
  const joiner = pathSegment.includes('?') ? '&' : '?';
  return `${baseUrl}${pathSegment}${joiner}token=${encodedToken}`;
}

function encodeBase64Url(value) {
  return Buffer.from(String(value || ''), 'utf8').toString('base64url');
}

function decodeBase64Url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function normalizeResetToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  let normalized = raw;
  try {
    normalized = decodeURIComponent(raw);
  } catch {
    normalized = raw;
  }

  return normalized
    .replace(/\s+/g, '')
    .replace(/^[<("'`]+/, '')
    .replace(/[>)"'`.,]+$/, '');
}

function hashResetTokenValue(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function signResetTokenPayload(encodedPayload) {
  return crypto
    .createHmac('sha256', PATIENT_PASSWORD_RESET_SIGNING_SECRET)
    .update(encodedPayload)
    .digest('base64url');
}

function issueStatelessPatientResetToken(email) {
  const payload = {
    email: normalizeEmail(email),
    exp: Date.now() + PATIENT_PASSWORD_RESET_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signResetTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyStatelessPatientResetToken(token) {
  const normalizedToken = normalizeResetToken(token);
  if (!normalizedToken || typeof normalizedToken !== 'string' || !normalizedToken.includes('.')) {
    return null;
  }

  const [encodedPayload, incomingSignature] = normalizedToken.split('.');
  const expectedSignature = signResetTokenPayload(encodedPayload);
  const incomingBuffer = Buffer.from(String(incomingSignature || ''), 'utf8');
  const expectedBuffer = Buffer.from(String(expectedSignature || ''), 'utf8');
  if (
    incomingBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(incomingBuffer, expectedBuffer)
  ) {
    return null;
  }

  let payload = null;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (!payload.exp || Number(payload.exp) < Date.now()) return null;
  const email = normalizeEmail(payload.email);
  if (!isLikelyPatientEmail(email)) return null;
  return { email };
}

function issueScopedPatientResetToken(subject) {
  return `${encodeBase64Url(String(subject || '').trim())}.${crypto.randomBytes(32).toString('base64url')}`;
}

function parseScopedPatientResetToken(token) {
  const normalizedToken = normalizeResetToken(token);
  const separatorIndex = normalizedToken.indexOf('.');
  if (separatorIndex <= 0 || separatorIndex >= normalizedToken.length - 1) {
    return null;
  }

  const encodedSubject = normalizedToken.slice(0, separatorIndex);
  const rawToken = normalizedToken;

  let subject = '';
  try {
    subject = String(decodeBase64Url(encodedSubject) || '').trim();
  } catch {
    subject = '';
  }

  if (!subject) {
    return null;
  }

  return {
    subject,
    rawToken,
  };
}

function safeTimingCompare(a, b) {
  const bufferA = Buffer.from(String(a || ''), 'utf8');
  const bufferB = Buffer.from(String(b || ''), 'utf8');
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
}

async function parseJsonBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  if (typeof req.body === 'string' && req.body.trim()) return JSON.parse(req.body);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
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

function getDoctorAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyDoctorToken(token);
}

async function requireDoctor(req, res) {
  const payload = getDoctorAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function getPatientAuth(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) {
    return null;
  }
  const token = header.slice('Bearer '.length);
  return verifyPatientToken(token);
}

async function requirePatient(req, res) {
  const payload = getPatientAuth(req);
  if (!payload) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return null;
  }
  return payload;
}

function isOpenForReview(status) {
  return OPEN_REVIEW_STATUSES.has(String(status || '').toLowerCase());
}

function userHasDoctorRole(user) {
  const metadataRole = String(user?.user_metadata?.role || user?.app_metadata?.role || '').toLowerCase();
  return ['provider', 'doctor', 'admin'].includes(metadataRole);
}

function userHasPatientRole(user) {
  const metadataRole = String(user?.user_metadata?.role || user?.app_metadata?.role || '').toLowerCase();
  if (!metadataRole) return !userHasDoctorRole(user);
  return !['provider', 'doctor', 'admin'].includes(metadataRole);
}

function parseSupabaseUsersPayload(payload) {
  return Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.users)
    ? payload.users
    : Array.isArray(payload?.data?.users)
    ? payload.data.users
    : [];
}

function toPatientAccountFromSupabaseUser(user, fallbackEmail = '') {
  if (!user) return null;
  const metadata = user?.user_metadata || {};
  return {
    email: normalizeEmail(user?.email || fallbackEmail),
    fullName: String(metadata?.full_name || '').trim(),
    dob: String(metadata?.dob || '').trim(),
    phone: String(metadata?.phone || '').trim(),
    source: 'supabase',
    createdAt: String(user?.created_at || ''),
    updatedAt: String(user?.updated_at || ''),
    lastLoginAt: '',
    lastPasswordResetAt: '',
    hasPassword: true,
  };
}

async function listSupabaseDoctorEmails() {
  const config = getSupabaseConfig();
  if (!config.enabled) return [];

  try {
    const users = await listSupabaseAuthUsers(config);

    return users
      .filter((entry) => userHasDoctorRole(entry))
      .map((entry) => normalizeEmail(entry?.email))
      .filter((email) => isLikelyDoctorEmail(email));
  } catch (errorObject) {
    info('doctor.notifications.supabase_list_failed', {
      message: errorObject?.message || String(errorObject),
    });
    return [];
  }
}

async function resolveDoctorNotificationEmails() {
  const localEmails = await listDoctorEmails();
  const supabaseEmails = await listSupabaseDoctorEmails();
  const deduped = Array.from(
    new Set(
      [...DOCTOR_NOTIFICATION_EMAILS_CONFIGURED, ...localEmails, ...supabaseEmails]
        .map((email) => normalizeEmail(email))
        .filter((email) => isLikelyDoctorEmail(email))
    )
  );

  if (deduped.length === 0) {
    return ['doctor@onyahealth.com'];
  }
  return deduped;
}


function isApprovedCertificate(certificate) {
  const status = String(certificate?.status || '').toLowerCase();
  if (status === 'approved') return true;
  if (certificate?.decision?.result === 'approved') return true;
  return false;
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

function patientSummaryFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  const approved = isApprovedCertificate(certificate);

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
    certificatePdfUrl: approved
      ? `/api/patient/requests/${encodeURIComponent(certificate.id)}/certificate.pdf`
      : null,
  };
}

function buildPatientIdentity({ email, latestCertificate, account }) {
  const draft = latestCertificate?.certificateDraft || {};
  return {
    fullName: String(account?.fullName || draft.fullName || '').trim(),
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

  let account = await getDoctorAccountByEmail(normalizedEmail);
  if (account?.email) return account;

  const supabaseDoctor = await findSupabaseDoctorByEmail(normalizedEmail);
  if (!supabaseDoctor?.email) return null;

  account = await upsertDoctorAccount({
    email: supabaseDoctor.email,
    fullName: supabaseDoctor.fullName || '',
    providerType: supabaseDoctor.providerType || '',
    registrationNumber: supabaseDoctor.registrationNumber || '',
    source: 'supabase',
  });
  return account;
}

function resolveDoctorDisplayName(account, fallbackEmail = '') {
  return (
    String(account?.fullName || '').trim() ||
    normalizeEmail(fallbackEmail) ||
    process.env.DOCTOR_DISPLAY_NAME ||
    'Onya Health Doctor'
  );
}

function doctorPayloadFromRequest(cert) {
  const dob = cert?.certificateDraft?.dob || '';
  let age = null;

  if (dob) {
    const birthday = new Date(dob);
    if (!Number.isNaN(birthday.getTime())) {
      const now = new Date();
      age = now.getFullYear() - birthday.getFullYear();
      const monthDiff = now.getMonth() - birthday.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birthday.getDate())) {
        age -= 1;
      }
    }
  }

  return {
    id: cert.id,
    createdAt: cert.createdAt,
    status: cert.status,
    serviceType: cert.serviceType,
    patientName: cert.certificateDraft.fullName,
    patientEmail: cert.certificateDraft.email,
    patientDob: dob,
    patientAge: age,
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
  const durationDays = Math.max(1, Number(consult.durationDays || 1));
  const isUnlimited = Boolean(consult.isUnlimited);
  const includeCarerCertificate = !isUnlimited && Boolean(consult.includeCarerCertificate);
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
  };
}

function sanitizeNameForStripe(value) {
  return String(value || '').trim().slice(0, 120);
}

function stripePricingFromRequest(body) {
  const isUnlimited = Boolean(body?.consult?.isUnlimited);
  const durationDays = Math.max(1, Number(body?.consult?.durationDays || 1));
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

  if (durationDays <= 1) {
    const baseUnitAmount = STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS;
    return {
      mode: 'payment',
      baseUnitAmount,
      carerCertificateAmount,
      includeCarerCertificate,
      unitAmount: baseUnitAmount + carerCertificateAmount,
      productId: STRIPE_PRICE_PRODUCT_SINGLE_DAY,
      displayName: 'Medical Consultation (Single day)',
      description: 'One-day medical certificate request',
    };
  }

  const baseUnitAmount = STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS;
  return {
    mode: 'payment',
    baseUnitAmount,
    carerCertificateAmount,
    includeCarerCertificate,
    unitAmount: baseUnitAmount + carerCertificateAmount,
    productId: STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF,
    displayName: 'Medical Consultation (Multi-day)',
    description: 'Multi-day medical certificate request',
  };
}

function isStripeEnabled() {
  return Boolean(STRIPE_SECRET_KEY);
}

async function createStripeCheckoutSession({ req, certificate, pricing, uiMode = 'hosted' }) {
  const stripeRequestStartedAt = Date.now();
  const frontendBase = getFrontendBaseUrl(req);
  const params = new URLSearchParams();
  params.set('mode', pricing.mode);
  if (uiMode === 'embedded') {
    params.set('ui_mode', 'embedded');
    params.set('return_url', `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
    params.set('redirect_on_completion', 'if_required');
  } else {
    params.set('success_url', `${frontendBase}/patient?checkout=success&session_id={CHECKOUT_SESSION_ID}`);
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

  let response;
  try {
    response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });
  } catch (errorObject) {
    error('stripe.checkout_session.create_failed', {
      certificateId: certificate.id,
      mode: pricing.mode,
      uiMode,
      durationMs: Date.now() - stripeRequestStartedAt,
      message: errorObject?.message || String(errorObject),
      status: null,
      code: null,
    });
    throw errorObject;
  }

  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    const message = payload?.error?.message || `Stripe session create failed (${response.status})`;
    error('stripe.checkout_session.create_failed', {
      certificateId: certificate.id,
      mode: pricing.mode,
      uiMode,
      durationMs: Date.now() - stripeRequestStartedAt,
      message,
      status: response.status,
      code: payload?.error?.code || null,
    });
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  info('stripe.checkout_session.create_succeeded', {
    certificateId: certificate.id,
    mode: pricing.mode,
    uiMode,
    durationMs: Date.now() - stripeRequestStartedAt,
    stripeSessionId: payload?.id || null,
  });

  return payload;
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
    const err = new Error(message);
    err.status = response.status;
    throw err;
  }

  return payload;
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
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
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
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
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

function buildStripeBillingReturnUrl(req, fallbackPath = STRIPE_BILLING_PORTAL_RETURN_PATH) {
  const baseUrl = getFrontendBaseUrl(req);
  const fallback = String(fallbackPath || '/patient').trim();
  const path = fallback.startsWith('/') ? fallback : `/${fallback}`;
  return `${baseUrl}${path}`;
}

async function createStripeBillingPortalSession(customerId, returnUrl) {
  const normalizedCustomerId = String(customerId || '').trim();
  if (!normalizedCustomerId) {
    const err = new Error('Stripe customer id is required');
    err.status = 400;
    throw err;
  }
  if (!STRIPE_SECRET_KEY) {
    const err = new Error('Stripe is not configured on the server');
    err.status = 500;
    throw err;
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
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  return payload;
}

async function cancelStripeSubscriptionAtPeriodEnd(subscriptionId) {
  const normalizedId = String(subscriptionId || '').trim();
  if (!normalizedId) {
    const err = new Error('Stripe subscription id is required');
    err.status = 400;
    throw err;
  }
  if (!STRIPE_SECRET_KEY) {
    const err = new Error('Stripe is not configured on the server');
    err.status = 500;
    throw err;
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
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  stripeSubscriptionCache.delete(normalizedId);
  return payload;
}

async function patientAccountExists(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const supabaseConfig = getSupabaseConfig();
  if (supabaseConfig.enabled) {
    const supabasePatient = await findSupabasePatientByEmail(normalized);
    if (supabasePatient) return true;
  }

  const localAccount = await getPatientAccountByEmail(normalized);
  return Boolean(localAccount);
}

async function sendDoctorReviewEmail(certificate, req) {
  const reviewUrl = `${getAppBaseUrl(req)}/doctor/login`;
  const recipients = await resolveDoctorNotificationEmails();
  const emailContent = renderDoctorReviewEmail({
    baseUrl: getFrontendBaseUrl(req),
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
  const patientEmail = certificate?.certificateDraft?.email;
  if (!patientEmail) return;

  if (isApprovedCertificate(certificate)) {
    const verificationCode = getCertificateVerificationCode(certificate);
    const verifyBaseUrl = FRONTEND_BASE_URL || APP_BASE_URL || '';
    try {
      const pdfBuffer = await buildCertificatePdf(certificate, {
        doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        doctorNotes: certificate?.decision?.notes || '',
        providerType: certificate?.decision?.providerType || '',
        registrationNumber: certificate?.decision?.registrationNumber || '',
        verificationCode,
        verifyUrl: verifyBaseUrl
          ? `${verifyBaseUrl}/verify?code=${encodeURIComponent(verificationCode)}`
          : '',
      });

      const emailContent = renderPatientCertificateReadyEmail({
        baseUrl: FRONTEND_BASE_URL || APP_BASE_URL || '',
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
        baseUrl: FRONTEND_BASE_URL || APP_BASE_URL || '',
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
    baseUrl: FRONTEND_BASE_URL || APP_BASE_URL || '',
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
  const patientEmail = certificate?.certificateDraft?.email;
  if (!patientEmail) return;

  const emailContent = renderPatientMoreInfoEmail({
    baseUrl: FRONTEND_BASE_URL || APP_BASE_URL || '',
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

async function markPaidFromStripeSession(session, trigger, req) {
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
    await sendDoctorReviewEmail(updated, req);
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

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const anonKey =
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    '';

  return {
    url,
    serviceRoleKey,
    anonKey,
    enabled: Boolean(url && serviceRoleKey),
  };
}

async function supabaseAuthAdminRequest(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}/auth/v1/admin/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(`Supabase auth admin request failed (${response.status}) ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function listSupabaseAuthUsers(config) {
  const payload = await supabaseAuthAdminRequest(config, 'users?page=1&per_page=1000', {
    method: 'GET',
  });
  return parseSupabaseUsersPayload(payload);
}

async function getSupabaseAuthUserById(config, userId) {
  if (!config.enabled || !userId) return null;

  const payload = await supabaseAuthAdminRequest(config, `users/${userId}`, {
    method: 'GET',
  });
  return payload?.user || payload?.data?.user || payload?.data || payload || null;
}

async function supabaseRestRequest(config, endpoint, options = {}) {
  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      'Content-Type': 'application/json',
      Prefer: options.prefer || 'return=representation',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!response.ok) {
    const err = new Error(`Supabase request failed (${response.status}) ${JSON.stringify(data)}`);
    err.status = response.status;
    err.data = data;
    throw err;
  }

  return data;
}

async function registerDoctorAccount({ email, password, fullName, providerType, registrationNumber }) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    const err = new Error('Doctor registration requires Supabase service role configuration');
    err.status = 500;
    throw err;
  }

  let created;
  try {
    created = await supabaseAuthAdminRequest(config, 'users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'provider',
          full_name: fullName || '',
          provider_type: String(providerType || '').trim(),
          registration_number: String(registrationNumber || '').trim().toUpperCase(),
        },
      },
    });
  } catch (authError) {
    const message = String(authError?.message || '');
    if (authError?.status === 422 || message.toLowerCase().includes('already')) {
      const conflict = new Error('Doctor account already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw authError;
  }

  const userId = created?.user?.id || created?.id || created?.data?.user?.id || created?.data?.id;
  if (!userId) {
    const err = new Error('Unable to create doctor account');
    err.status = 500;
    throw err;
  }

  await supabaseRestRequest(config, 'profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: userId,
      role: 'provider',
    },
  });

  // Best-effort provider row upsert for projects that include this table.
  try {
    await supabaseRestRequest(config, 'providers', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: {
        id: userId,
      },
    });
  } catch {
    // Ignore if providers schema differs.
  }

  return { userId };
}

async function authenticateDoctorViaSupabase(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const loginResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const loginText = await loginResponse.text();
  let loginData = null;
  try {
    loginData = loginText ? JSON.parse(loginText) : null;
  } catch {
    loginData = null;
  }

  if (!loginResponse.ok) {
    return null;
  }

  const userId = loginData?.user?.id;
  if (!userId) return null;

  let role = String(loginData?.user?.user_metadata?.role || '').toLowerCase();
  if (config.enabled) {
    try {
      const rows = await supabaseRestRequest(
        config,
        `profiles?id=eq.${encodeURIComponent(userId)}&select=role&limit=1`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      );
      role = String(rows?.[0]?.role || role).toLowerCase();
    } catch {
      // Ignore profile lookup errors and fallback to auth metadata role.
    }
  }

  if (!['provider', 'admin', 'doctor'].includes(role)) {
    return null;
  }

  return {
    email: normalizeEmail(loginData?.user?.email || email),
    fullName: String(loginData?.user?.user_metadata?.full_name || '').trim(),
    providerType: String(loginData?.user?.user_metadata?.provider_type || '').trim(),
    registrationNumber: String(loginData?.user?.user_metadata?.registration_number || '').trim().toUpperCase(),
    source: 'supabase',
  };
}

async function findSupabaseDoctorByEmail(email) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const users = await listSupabaseAuthUsers(config);

  const normalized = normalizeEmail(email);
  const match = users.find((entry) => normalizeEmail(entry?.email) === normalized && userHasDoctorRole(entry));
  if (!match) return null;

  return {
    id: match.id || null,
    email: normalizeEmail(match.email),
    fullName: String(match?.user_metadata?.full_name || '').trim(),
    providerType: String(match?.user_metadata?.provider_type || '').trim(),
    registrationNumber: String(match?.user_metadata?.registration_number || '').trim().toUpperCase(),
  };
}

async function updateSupabaseDoctorPasswordByEmail(email, password) {
  const doctor = await findSupabaseDoctorByEmail(email);
  if (!doctor?.id) return null;

  const config = getSupabaseConfig();
  await supabaseAuthAdminRequest(config, `users/${doctor.id}`, {
    method: 'PUT',
    body: {
      password,
    },
  });

  return doctor;
}

async function upsertSupabaseDoctorMetadata({ email, fullName = '', providerType = '', registrationNumber = '' }) {
  const existing = await findSupabaseDoctorByEmail(email);
  if (!existing?.id) return null;

  const config = getSupabaseConfig();
  const users = await listSupabaseAuthUsers(config);
  const user = users.find((entry) => String(entry?.id || '') === String(existing.id)) || null;
  if (!user) return existing;

  const currentMetadata = user?.user_metadata || {};
  const nextMetadata = {
    ...currentMetadata,
    role: String(currentMetadata?.role || 'provider'),
    full_name: String(fullName || currentMetadata?.full_name || '').trim(),
    provider_type: String(providerType || currentMetadata?.provider_type || '').trim(),
    registration_number: String(
      registrationNumber || currentMetadata?.registration_number || ''
    )
      .trim()
      .toUpperCase(),
  };

  const changed = JSON.stringify(currentMetadata) !== JSON.stringify(nextMetadata);
  if (changed) {
    await supabaseAuthAdminRequest(config, `users/${existing.id}`, {
      method: 'PUT',
      body: { user_metadata: nextMetadata },
    });
  }

  return {
    ...existing,
    fullName: String(nextMetadata.full_name || '').trim(),
    providerType: String(nextMetadata.provider_type || '').trim(),
    registrationNumber: String(nextMetadata.registration_number || '').trim().toUpperCase(),
  };
}

async function findSupabasePatientUserByEmail(email) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const users = await listSupabaseAuthUsers(config);
  const normalized = normalizeEmail(email);
  return users.find((entry) => normalizeEmail(entry?.email) === normalized && userHasPatientRole(entry)) || null;
}

async function findSupabasePatientByEmail(email) {
  const match = await findSupabasePatientUserByEmail(email);
  if (!match) return null;

  return {
    id: match.id || null,
    ...toPatientAccountFromSupabaseUser(match, email),
  };
}

async function createPatientAccountViaSupabase({ email, password, fullName = '', dob = '', phone = '' }) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  let created;
  try {
    created = await supabaseAuthAdminRequest(config, 'users', {
      method: 'POST',
      body: {
        email,
        password,
        email_confirm: true,
        user_metadata: {
          role: 'patient',
          full_name: String(fullName || '').trim(),
          dob: String(dob || '').trim(),
          phone: String(phone || '').trim(),
        },
      },
    });
  } catch (errorObject) {
    const message = String(errorObject?.message || '').toLowerCase();
    if (errorObject?.status === 422 || message.includes('already')) {
      const conflict = new Error('Patient account already exists');
      conflict.status = 409;
      throw conflict;
    }
    throw errorObject;
  }

  const user = created?.user || created?.data?.user || created || null;
  return toPatientAccountFromSupabaseUser(user, email);
}

async function authenticatePatientViaSupabase(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return null;
  }

  const loginResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: config.anonKey,
      Authorization: `Bearer ${config.anonKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  const text = await loginResponse.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!loginResponse.ok) return null;
  const user = data?.user || null;
  if (!user) return null;
  if (userHasDoctorRole(user)) return null;

  return toPatientAccountFromSupabaseUser(user, email);
}

async function updateSupabasePatientPasswordByEmail(email, password) {
  const account = await findSupabasePatientByEmail(email);
  if (!account?.id) return null;

  const config = getSupabaseConfig();
  await supabaseAuthAdminRequest(config, `users/${account.id}`, {
    method: 'PUT',
    body: { password },
  });

  return account;
}

function getSupabasePatientResetState(user) {
  const metadata = user?.user_metadata || {};
  const resetState = metadata?.[PATIENT_SUPABASE_RESET_METADATA_KEY];
  return resetState && typeof resetState === 'object' ? resetState : null;
}

async function issueSupabasePatientPasswordResetToken(email) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const user = await findSupabasePatientUserByEmail(email);
  if (!user?.id) return null;

  const token = issueScopedPatientResetToken(user.id);
  const resetState = {
    tokenHash: hashResetTokenValue(token),
    issuedAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + PATIENT_PASSWORD_RESET_TTL_MS).toISOString(),
    usedAt: null,
  };

  await supabaseAuthAdminRequest(config, `users/${user.id}`, {
    method: 'PUT',
    body: {
      user_metadata: {
        ...(user?.user_metadata || {}),
        [PATIENT_SUPABASE_RESET_METADATA_KEY]: resetState,
      },
    },
  });

  return {
    email: normalizeEmail(email),
    token,
    expiresAt: resetState.expiresAt,
  };
}

async function verifySupabasePatientPasswordResetToken(token) {
  const parsed = parseScopedPatientResetToken(token);
  if (!parsed?.subject || !parsed.rawToken) {
    info('patient.password_reset.verify.failed', {
      reason: 'token_parse_failed',
      tokenLength: String(token || '').length,
    });
    return null;
  }

  const config = getSupabaseConfig();
  if (!config.enabled) {
    info('patient.password_reset.verify.failed', {
      reason: 'supabase_not_enabled',
    });
    return null;
  }

  const user = await getSupabaseAuthUserById(config, parsed.subject);
  if (!user?.id) {
    info('patient.password_reset.verify.failed', {
      reason: 'user_not_found',
      userId: parsed.subject,
    });
    return null;
  }
  if (!userHasPatientRole(user)) {
    info('patient.password_reset.verify.failed', {
      reason: 'user_not_patient',
      userId: parsed.subject,
      email: normalizeEmail(user.email),
    });
    return null;
  }

  const resetState = getSupabasePatientResetState(user);
  if (!resetState || resetState.usedAt) {
    info('patient.password_reset.verify.failed', {
      reason: resetState?.usedAt ? 'token_already_used' : 'missing_reset_state',
      userId: user.id,
      email: normalizeEmail(user.email),
    });
    return null;
  }

  const expiresAt = new Date(resetState.expiresAt || '').getTime();
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    info('patient.password_reset.verify.failed', {
      reason: 'token_expired',
      userId: user.id,
      email: normalizeEmail(user.email),
      expiresAt: resetState.expiresAt || null,
    });
    return null;
  }

  if (!safeTimingCompare(resetState.tokenHash, hashResetTokenValue(parsed.rawToken))) {
    info('patient.password_reset.verify.failed', {
      reason: 'token_hash_mismatch',
      userId: user.id,
      email: normalizeEmail(user.email),
    });
    return null;
  }

  return {
    email: normalizeEmail(user.email),
    user,
  };
}

async function clearSupabasePatientPasswordResetToken(user) {
  if (!user?.id) return;

  const config = getSupabaseConfig();
  if (!config.enabled) return;

  const nextMetadata = {
    ...(user?.user_metadata || {}),
  };
  delete nextMetadata[PATIENT_SUPABASE_RESET_METADATA_KEY];

  await supabaseAuthAdminRequest(config, `users/${user.id}`, {
    method: 'PUT',
    body: {
      user_metadata: nextMetadata,
    },
  });
}

async function upsertSupabasePatientMetadata({ email, fullName, dob, phone }) {
  const existing = await findSupabasePatientByEmail(email);
  if (!existing?.id) return null;

  const usersConfig = getSupabaseConfig();
  const users = await listSupabaseAuthUsers(usersConfig);
  const user = users.find((entry) => String(entry?.id || '') === String(existing.id)) || null;
  if (!user) return existing;

  const currentMetadata = user?.user_metadata || {};
  const nextMetadata = {
    ...currentMetadata,
    role: String(currentMetadata?.role || 'patient'),
    full_name: String(fullName || currentMetadata?.full_name || '').trim(),
    dob: String(dob || currentMetadata?.dob || '').trim(),
    phone: String(phone || currentMetadata?.phone || '').trim(),
  };

  const changed = JSON.stringify(currentMetadata) !== JSON.stringify(nextMetadata);
  if (changed) {
    await supabaseAuthAdminRequest(usersConfig, `users/${existing.id}`, {
      method: 'PUT',
      body: {
        user_metadata: nextMetadata,
      },
    });
  }

  return {
    ...existing,
    fullName: String(nextMetadata.full_name || '').trim(),
    dob: String(nextMetadata.dob || '').trim(),
    phone: String(nextMetadata.phone || '').trim(),
  };
}

function parseApiRoute(req) {
  const url = new URL(req.url || '/api', getRequestBaseUrl(req));
  const forcedPath = String(url.searchParams.get('__route') || '').replace(/^\/+/, '').replace(/\/+$/, '');
  const directPath = url.pathname.replace(/^\/api\/?/, '').replace(/\/+$/, '');
  const routePath = (forcedPath || directPath).replace(/^index\/?/, '');
  const segments = routePath ? routePath.split('/').filter(Boolean) : [];
  return { url, routePath, segments };
}

function getStatusFilterFromUrl(url) {
  const value = url.searchParams.get('status');
  return value ? String(value) : null;
}

function isPdfPath(segments) {
  return segments.length === 4 && segments[0] === 'patient' && segments[1] === 'requests' && segments[3] === 'certificate.pdf';
}

export default async function handler(req, res) {
  setCors(res, req);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  const { url, routePath, segments } = parseApiRoute(req);
  if (POST_ONLY_ROUTES.has(routePath) && req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed. Use POST for this endpoint.' });
    return;
  }

  try {
    if (req.method === 'GET' && routePath === 'health') {
      sendJson(res, 200, {
        ok: true,
        service: 'onya-health-backend',
        runtime: 'vercel-function',
        storage: isSupabaseStorageEnabled() ? 'supabase' : 'local-json',
        emailProvider: currentEmailProvider(),
        smtpConfigured: Boolean(
          String(process.env.SMTP_HOST || '').trim() &&
            String(process.env.SMTP_USER || '').trim() &&
            String(process.env.SMTP_PASS || '').trim()
        ),
        resendConfigured: Boolean(String(process.env.RESEND_API_KEY || '').trim()),
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'certificates/verify') {
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

    if (req.method === 'POST' && routePath === 'stripe/webhook') {
      try {
        const signature = req.headers['stripe-signature'];
        let event = null;

        try {
          const rawBody = await parseRawBody(req);
          event = verifyStripeEvent(rawBody, signature);
        } catch (signatureError) {
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
          await markPaidFromStripeSession(session, 'stripe_webhook', req);
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

        sendJson(res, 200, { received: true });
        return;
      } catch (err) {
        error('stripe.webhook.failed', {
          message: err?.message || String(err),
        });
        sendJson(res, 400, { error: err?.message || 'Invalid Stripe webhook' });
        return;
      }
    }

    if (req.method === 'POST' && routePath === 'checkout/session') {
      const checkoutStartedAt = Date.now();
      let checkoutCertificateId = null;

      try {
        if (!isStripeEnabled()) {
          sendJson(res, 500, { error: 'Stripe is not configured on the server' });
          return;
        }

        const body = await parseJsonBody(req);
        const requestedUiMode = body?.uiMode === 'embedded' ? 'embedded' : 'hosted';
        const patient = body?.patient || {};
        const certificateDraft = buildDraftCertificate(body);
        body.consult = {
          ...(body?.consult || {}),
          startDate: certificateDraft.startDate,
          durationDays: certificateDraft.durationDays,
          includeCarerCertificate: certificateDraft.includeCarerCertificate,
        };

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
          const bypassLookupStartedAt = Date.now();
          const certificates = await listCertificates();
          const billing = await resolvePatientBillingProfile(normalizedPatientEmail, certificates);
          const bypassLookupDurationMs = Date.now() - bypassLookupStartedAt;

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

            checkoutCertificateId = certificate.id;

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
            await sendDoctorReviewEmail(certificate, req);

            const checkoutDurationMs = Date.now() - checkoutStartedAt;
            const timingStats = recordCheckoutTimingSample({ totalMs: checkoutDurationMs });
            info('checkout.session.bypassed_active_subscription', {
              certificateId: certificate.id,
              patientEmail: normalizedPatientEmail,
              stripeCustomerId: billing.stripeCustomerId || null,
              stripeSubscriptionId: billing.stripeSubscriptionId || null,
              bypassLookupDurationMs,
              checkoutDurationMs,
              timingWindowSize: timingStats.windowSize,
              totalSamples: timingStats.totalSamples,
              rollingTotalP50Ms: timingStats.totalP50Ms,
              rollingTotalP95Ms: timingStats.totalP95Ms,
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
        checkoutCertificateId = certificateId;
        const verificationCode = buildCertificateVerificationCode(certificateId);
        const certificate = {
          id: certificateId,
          createdAt: new Date().toISOString(),
          status: 'awaiting_payment',
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

        const stripeStartedAt = Date.now();
        const sessionPromise = createStripeCheckoutSession({
          req,
          certificate,
          pricing,
          uiMode: requestedUiMode,
        }).then((session) => ({
          session,
          durationMs: Date.now() - stripeStartedAt,
        }));

        const persistenceStartedAt = Date.now();
        const persistPromise = createCertificate(certificate).then((createdCertificate) => ({
          createdCertificate,
          durationMs: Date.now() - persistenceStartedAt,
        }));

        const [sessionResult, persistenceResult] = await Promise.all([sessionPromise, persistPromise]);
        const session = sessionResult.session;

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

        const checkoutDurationMs = Date.now() - checkoutStartedAt;
        const timingStats = recordCheckoutTimingSample({
          totalMs: checkoutDurationMs,
          stripeMs: sessionResult.durationMs,
          persistenceMs: persistenceResult.durationMs,
        });
        info('checkout.session.created', {
          certificateId: certificate.id,
          stripeSessionId: session.id || null,
          mode: pricing.mode,
          amount: pricing.unitAmount,
          includeCarerCertificate: pricing.includeCarerCertificate,
          uiMode: requestedUiMode,
          stripeDurationMs: sessionResult.durationMs,
          persistenceDurationMs: persistenceResult.durationMs,
          checkoutDurationMs,
          timingWindowSize: timingStats.windowSize,
          totalSamples: timingStats.totalSamples,
          stripeSamples: timingStats.stripeSamples,
          persistenceSamples: timingStats.persistenceSamples,
          rollingTotalP50Ms: timingStats.totalP50Ms,
          rollingTotalP95Ms: timingStats.totalP95Ms,
          rollingStripeP50Ms: timingStats.stripeP50Ms,
          rollingStripeP95Ms: timingStats.stripeP95Ms,
          rollingPersistenceP50Ms: timingStats.persistenceP50Ms,
          rollingPersistenceP95Ms: timingStats.persistenceP95Ms,
        });

        sendJson(res, 200, {
          certificateId: certificate.id,
          verificationCode: getCertificateVerificationCode(certificate),
          checkoutUrl: session.url,
          sessionId: session.id,
          clientSecret: session.client_secret || null,
          uiMode: requestedUiMode,
        });
        return;
      } catch (checkoutError) {
        error('checkout.session.failed', {
          certificateId: checkoutCertificateId,
          durationMs: Date.now() - checkoutStartedAt,
          message: checkoutError?.message || String(checkoutError),
          status: checkoutError?.status || null,
        });
        throw checkoutError;
      }
    }

    if (req.method === 'POST' && routePath === 'checkout/confirm') {
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

      const result = await markPaidFromStripeSession(session, 'checkout_success_confirm', req);
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

    if (req.method === 'POST' && routePath === 'patient/checkout/account/setup') {
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
      const passwordError = validatePatientPassword(password);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
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

      const result = await markPaidFromStripeSession(session, 'checkout_account_setup', req);
      const expectedEmail = normalizeEmail(result?.patientEmail || session?.metadata?.patient_email || '');
      if (!expectedEmail) {
        sendJson(res, 400, { error: 'Unable to determine the patient email for this checkout' });
        return;
      }
      if (email !== expectedEmail) {
        sendJson(res, 400, { error: `Email must match the consult email (${expectedEmail})` });
        return;
      }

      const certificates = await listCertificatesByPatientEmail(expectedEmail);
      const { latest, latestProfile } = getLatestPatientSnapshot(certificates, expectedEmail);
      const { fullName, dob, phone } = latestProfile;

      let account = null;
      const supabaseConfig = getSupabaseConfig();
      if (await patientAccountExists(expectedEmail)) {
        sendJson(res, 409, {
          error: 'An account already exists for this email. Please sign in to continue.',
          code: 'ACCOUNT_EXISTS',
          loginPath: '/patient-login',
          patientEmail: expectedEmail,
        });
        return;
      }

      if (supabaseConfig.enabled) {
        try {
          account = await createPatientAccountViaSupabase({
            email: expectedEmail,
            password,
            fullName,
            dob,
            phone,
          });
        } catch (errorObject) {
          if (errorObject?.status === 409) {
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

        if (!account) {
          account = await findSupabasePatientByEmail(expectedEmail);
        }
      } else {
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

    if (req.method === 'POST' && routePath === 'patient/login') {
      const loginStartedAt = Date.now();
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const dob = String(body.dob || '').trim();
      const password = String(body.password || '');

      if (!email) {
        sendJson(res, 400, { error: 'Email is required' });
        return;
      }

      const supabaseConfig = getSupabaseConfig();

      if (password) {
        const authStartedAt = Date.now();
        let account = null;
        if (supabaseConfig.url && supabaseConfig.anonKey) {
          account = await authenticatePatientViaSupabase(email, password);
        }
        if (!account) {
          account = await authenticatePatientAccount({ email, password });
        }
        if (!account) {
          sendJson(res, 401, { error: 'Invalid email or password' });
          return;
        }

        const snapshotStartedAt = Date.now();
        const patientCertificates = await listCertificatesByPatientEmail(email);
        const { latest } = getLatestPatientSnapshot(patientCertificates, email);
        const snapshotDurationMs = Date.now() - snapshotStartedAt;
        void syncPatientProfileFromLatest({
          email,
          latestCertificate: latest,
          supabaseEnabled: supabaseConfig.enabled,
          upsertSupabasePatientMetadata,
          updatePatientAccountProfile,
        }).catch((profileSyncError) => {
          error('patient.profile.sync_after_login_failed', {
            email,
            method: 'password',
            message: profileSyncError?.message || String(profileSyncError),
          });
        });

        const token = issuePatientToken(email);
        sendJson(res, 200, {
          token,
          patient: buildPatientIdentity({
            email,
            latestCertificate: latest,
            account,
          }),
        });
        info('patient.login.success', {
          email,
          method: 'password',
          authDurationMs: Date.now() - authStartedAt,
          snapshotDurationMs,
          certificateCount: patientCertificates.length,
          totalDurationMs: Date.now() - loginStartedAt,
        });
        return;
      }

      const snapshotStartedAt = Date.now();
      const patientCertificates = await listCertificatesByPatientEmail(email);
      const { latest, latestProfile } = getLatestPatientSnapshot(patientCertificates, email);
      const snapshotDurationMs = Date.now() - snapshotStartedAt;
      if (patientCertificates.length === 0) {
        sendJson(res, 404, { error: 'No patient account found for this email yet' });
        return;
      }

      if (latestProfile.dob && !dob) {
        sendJson(res, 400, { error: 'Date of birth is required for this account' });
        return;
      }
      if (dob && latestProfile.dob && latestProfile.dob !== dob) {
        sendJson(res, 401, { error: 'Date of birth did not match our records' });
        return;
      }

      void syncPatientProfileFromLatest({
        email,
        latestCertificate: latest,
        supabaseEnabled: supabaseConfig.enabled,
        upsertSupabasePatientMetadata,
        updatePatientAccountProfile,
      }).catch((profileSyncError) => {
        error('patient.profile.sync_after_login_failed', {
          email,
          method: 'dob',
          message: profileSyncError?.message || String(profileSyncError),
        });
      });

      const token = issuePatientToken(email);
      sendJson(res, 200, {
        token,
        patient: buildPatientIdentity({ email, latestCertificate: latest, account: null }),
      });
      info('patient.login.success', {
        email,
        method: 'dob',
        snapshotDurationMs,
        certificateCount: patientCertificates.length,
        totalDurationMs: Date.now() - loginStartedAt,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/register') {
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
      const passwordError = validatePatientPassword(password);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }

      let account;
      const supabaseConfig = getSupabaseConfig();
      if (supabaseConfig.enabled) {
        try {
          account = await createPatientAccountViaSupabase({
            email,
            password,
            fullName,
            dob,
            phone,
          });
        } catch (errorObject) {
          if (errorObject?.status === 409) {
            sendJson(res, 409, { error: 'An account already exists for this email' });
            return;
          }
          throw errorObject;
        }
      } else {
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
      }

      await appendAudit({
        type: 'PATIENT_ACCOUNT_CREATED',
        email,
      });

      try {
        const welcomeEmail = renderPatientWelcomeEmail({
          baseUrl: getFrontendBaseUrl(req),
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
        patient: buildPatientIdentity({
          email,
          latestCertificate: null,
          account,
        }),
      });
      info('patient.register.success', { email });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/password/reset/request') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);

      if (!isLikelyPatientEmail(email)) {
        sendJson(res, 400, { error: 'A valid email is required' });
        return;
      }

      const supabaseConfig = getSupabaseConfig();
      let canIssueReset = false;
      let resetTokenMode = supabaseConfig.enabled ? 'supabase' : 'local';
      let latest = null;
      let latestProfile = {
        fullName: '',
        dob: '',
        phone: '',
      };
      let latestSnapshotLoaded = false;
      const ensureLatestSnapshot = async () => {
        if (latestSnapshotLoaded) return;
        const certificates = await listCertificatesByPatientEmail(email);
        const snapshot = getLatestPatientSnapshot(certificates, email);
        latest = snapshot.latest;
        latestProfile = snapshot.latestProfile;
        latestSnapshotLoaded = true;
      };

      if (supabaseConfig.enabled) {
        let supabasePatient = await findSupabasePatientByEmail(email);
        if (!supabasePatient) {
          await ensureLatestSnapshot();
          if (latest) {
            try {
              await createPatientAccountViaSupabase({
                email,
                password: createBootstrapPassword(),
                fullName: latestProfile.fullName,
                dob: latestProfile.dob,
                phone: latestProfile.phone,
              });
            } catch (errorObject) {
              // Account may already exist in Supabase auth with different metadata.
              if (errorObject?.status === 409) {
                await upsertSupabasePatientMetadata({
                  email,
                  fullName: latestProfile.fullName,
                  dob: latestProfile.dob,
                  phone: latestProfile.phone,
                });
              } else {
                throw errorObject;
              }
            }

            supabasePatient = await findSupabasePatientByEmail(email);
            if (supabasePatient) {
              await appendAudit({
                type: 'PATIENT_ACCOUNT_BOOTSTRAPPED_FOR_RESET',
                email,
              });
            }
          }
        }
        canIssueReset = Boolean(supabasePatient);

        // In Supabase mode we still allow reset for legacy local-auth accounts.
        if (!canIssueReset) {
          const localAccount = await getPatientAccountByEmail(email);
          if (localAccount) {
            canIssueReset = true;
            resetTokenMode = 'stateless';
            info('patient.password_reset.requested_local_fallback', {
              email,
            });
          }
        }
      } else {
        let localAccount = await getPatientAccountByEmail(email);
        if (!localAccount) {
          await ensureLatestSnapshot();
          if (latest) {
            try {
              await createPatientAccount({
                email,
                password: createBootstrapPassword(),
                fullName: latestProfile.fullName,
                dob: latestProfile.dob,
                phone: latestProfile.phone,
              });
            } catch (errorObject) {
              if (errorObject?.code !== 'ACCOUNT_EXISTS') {
                throw errorObject;
              }
            }

            await updatePatientAccountProfile({
              email,
              fullName: latestProfile.fullName,
              dob: latestProfile.dob,
              phone: latestProfile.phone,
            });

            localAccount = await getPatientAccountByEmail(email);
            if (localAccount) {
              await appendAudit({
                type: 'PATIENT_ACCOUNT_BOOTSTRAPPED_FOR_RESET',
                email,
              });
            }
          }
        }
        canIssueReset = Boolean(localAccount);
      }

      if (canIssueReset) {
        let resetPayload = null;
        if (supabaseConfig.enabled) {
          if (resetTokenMode === 'stateless') {
            resetPayload = {
              email,
              token: issueStatelessPatientResetToken(email),
              expiresAt: new Date(Date.now() + PATIENT_PASSWORD_RESET_TTL_MS).toISOString(),
            };
          } else {
            resetPayload = await issueSupabasePatientPasswordResetToken(email);
          }
        } else {
          resetPayload = await issuePasswordResetToken(email, PATIENT_PASSWORD_RESET_TTL_MS);
        }

        if (!resetPayload?.token) {
          throw new Error('Unable to issue patient password reset token');
        }

        const resetUrl = buildPatientPasswordResetUrl(req, resetPayload.token);
        const resetEmail = renderPatientPasswordResetEmail({
          baseUrl: getFrontendBaseUrl(req),
          resetUrl,
          expiresMinutes: String(Math.round(PATIENT_PASSWORD_RESET_TTL_MS / (1000 * 60))),
        });

        try {
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
        } catch (errorObject) {
          error('patient.password_reset.dispatch_failed', {
            email,
            message: errorObject?.message || String(errorObject),
            mode: resetTokenMode,
          });
        }
      } else {
        info('patient.password_reset.requested_without_existing_account', {
          email,
        });
      }

      info('patient.password_reset.requested', {
        email,
        provider: currentEmailProvider(),
        accountFound: canIssueReset,
        resetTokenMode: canIssueReset ? resetTokenMode : 'none',
      });

      sendJson(res, 200, {
        message: 'If an account exists for this email, a reset link has been sent.',
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/password/reset/confirm') {
      const body = await parseJsonBody(req);
      const token = normalizeResetToken(body.token);
      const nextPassword = String(body.password || body.newPassword || '');

      if (!token || !nextPassword) {
        sendJson(res, 400, { error: 'token and password are required' });
        return;
      }
      const passwordError = validatePatientPassword(nextPassword);
      if (passwordError) {
        sendJson(res, 400, { error: passwordError });
        return;
      }

      let account = null;
      const supabaseConfig = getSupabaseConfig();
      if (supabaseConfig.enabled) {
        const decoded =
          (await verifySupabasePatientPasswordResetToken(token)) || verifyStatelessPatientResetToken(token);
        if (!decoded?.email) {
          info('patient.password_reset.confirm.invalid_token', {
            tokenLength: token.length,
            supabaseEnabled: true,
          });
          sendJson(res, 400, { error: 'Invalid or expired reset token' });
          return;
        }

        const email = normalizeEmail(decoded.email);
        let existing = await findSupabasePatientByEmail(email);
        let latestProfile = {
          fullName: '',
          dob: '',
          phone: '',
        };
        if (!existing) {
          const certificates = await listCertificatesByPatientEmail(email);
          ({ latestProfile } = getLatestPatientSnapshot(certificates, email));
          try {
            account = await createPatientAccountViaSupabase({
              email,
              password: nextPassword,
              fullName: latestProfile.fullName,
              dob: latestProfile.dob,
              phone: latestProfile.phone,
            });
          } catch (errorObject) {
            if (errorObject?.status === 409) {
              existing = await findSupabasePatientByEmail(email);
            } else {
              throw errorObject;
            }
          }
        }
        if (!account && existing) {
          await updateSupabasePatientPasswordByEmail(email, nextPassword);
          account = await findSupabasePatientByEmail(email);
        }

        if (decoded?.user) {
          try {
            await clearSupabasePatientPasswordResetToken(decoded.user);
          } catch (errorObject) {
            error('patient.password_reset.confirm.clear_token_failed', {
              email,
              message: errorObject?.message || String(errorObject),
            });
          }
        }

        if (!account) {
          sendJson(res, 400, { error: 'Invalid or expired reset token' });
          return;
        }

        await appendAudit({
          type: 'PATIENT_PASSWORD_RESET_COMPLETED',
          email,
        });

        const patientToken = issuePatientToken(email);
        sendJson(res, 200, {
          token: patientToken,
          patient: buildPatientIdentity({
            email,
            latestCertificate: null,
            account,
          }),
        });
        info('patient.password_reset.completed', { email });
        return;
      } else {
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
          if (
            errorObject?.code === 'TOKEN_INVALID' ||
            errorObject?.code === 'TOKEN_EXPIRED' ||
            String(errorObject?.message || '').toLowerCase().includes('invalid or expired')
          ) {
            info('patient.password_reset.confirm.invalid_token', {
              tokenLength: token.length,
              supabaseEnabled: false,
            });
            sendJson(res, 400, { error: 'Invalid or expired reset token' });
            return;
          }
          throw errorObject;
        }
      }

      if (!account) {
        sendJson(res, 400, { error: 'Invalid or expired reset token' });
        return;
      }

      const email = normalizeEmail(account.email);
      await appendAudit({
        type: 'PATIENT_PASSWORD_RESET_COMPLETED',
        email,
      });

      const patientToken = issuePatientToken(email);
      sendJson(res, 200, {
        token: patientToken,
        patient: buildPatientIdentity({
          email,
          latestCertificate: null,
          account,
        }),
      });
      info('patient.password_reset.completed', { email });
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/me') {
      const patientMeStartedAt = Date.now();
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const supabaseConfig = getSupabaseConfig();
      const account = await getPatientAccountByEmail(patient.email);
      const certificatesFetchStartedAt = Date.now();
      const certificates = await listCertificatesByPatientEmail(patient.email);
      const certificatesFetchDurationMs = Date.now() - certificatesFetchStartedAt;
      const billing = await resolvePatientBillingProfile(patient.email, certificates);
      const { patientCertificates, latest } = getLatestPatientSnapshot(certificates, patient.email);
      if (patientCertificates.length === 0 && !account) {
        sendJson(res, 404, { error: 'Patient not found' });
        return;
      }

      void syncPatientProfileFromLatest({
        email: patient.email,
        latestCertificate: latest,
        supabaseEnabled: supabaseConfig.enabled,
        upsertSupabasePatientMetadata,
        updatePatientAccountProfile,
      }).catch((profileSyncError) => {
        error('patient.profile.sync_after_me_failed', {
          email: patient.email,
          message: profileSyncError?.message || String(profileSyncError),
        });
      });

      sendJson(res, 200, {
        patient: buildPatientIdentity({
          email: patient.email,
          latestCertificate: latest,
          account,
        }),
        billing,
        queueCount: patientCertificates.filter((item) => isOpenForReview(item.status)).length,
        latestRequest: latest ? patientSummaryFromCertificate(latest) : null,
      });
      info('patient.me.loaded', {
        email: patient.email,
        requestCount: patientCertificates.length,
        queueCount: patientCertificates.filter((item) => isOpenForReview(item.status)).length,
        certificatesFetchDurationMs,
        totalDurationMs: Date.now() - patientMeStartedAt,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/billing/portal') {
      const patient = await requirePatient(req, res);
      if (!patient) return;
      if (!isStripeEnabled()) {
        sendJson(res, 500, { error: 'Stripe billing is not configured on the server' });
        return;
      }

      const body = await parseJsonBody(req);
      const requestedReturnUrl = String(body?.returnUrl || body?.return_url || '').trim();
      const fallbackReturnUrl = buildStripeBillingReturnUrl(req);
      const safeReturnUrl =
        requestedReturnUrl.startsWith('https://') || requestedReturnUrl.startsWith('http://')
          ? requestedReturnUrl
          : fallbackReturnUrl;

      const billing = await resolvePatientBillingProfile(patient.email);
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

    if (req.method === 'POST' && routePath === 'patient/subscription/cancel') {
      const patient = await requirePatient(req, res);
      if (!patient) return;
      if (!isStripeEnabled()) {
        sendJson(res, 500, { error: 'Stripe billing is not configured on the server' });
        return;
      }

      const billing = await resolvePatientBillingProfile(patient.email);
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
      const refreshedBilling = await resolvePatientBillingProfile(patient.email);

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

    if (req.method === 'GET' && routePath === 'patient/requests') {
      const patientRequestsStartedAt = Date.now();
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certificatesFetchStartedAt = Date.now();
      const patientCertificates = await listCertificatesByPatientEmail(patient.email);
      const certificatesFetchDurationMs = Date.now() - certificatesFetchStartedAt;

      sendJson(res, 200, {
        count: patientCertificates.length,
        requests: patientCertificates.map(patientSummaryFromCertificate),
      });
      info('patient.requests.loaded', {
        email: patient.email,
        requestCount: patientCertificates.length,
        certificatesFetchDurationMs,
        totalDurationMs: Date.now() - patientRequestsStartedAt,
      });
      return;
    }

    if (req.method === 'GET' && segments.length === 3 && segments[0] === 'patient' && segments[1] === 'requests') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'patient' && segments[1] === 'requests' && segments[3] === 'message') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
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
        baseUrl: getFrontendBaseUrl(req),
        certId,
        patientEmail: normalizeEmail(patient.email),
        message,
      });

      await sendEmail({
        to: recipients,
        subject: `Patient message for request ${certId}`,
        html: patientMessageEmail.html,
        text: patientMessageEmail.text,
      });

      info('patient.message.sent', {
        certificateId: certId,
        patientEmail: normalizeEmail(patient.email),
        provider: currentEmailProvider(),
        recipients,
      });

      sendJson(res, 200, { message: 'Message sent to doctor' });
      return;
    }

    if (req.method === 'GET' && isPdfPath(segments)) {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const certId = decodeURIComponent(segments[2]);
      const certificate = await getCertificateById(certId);
      if (!certificate) {
        sendJson(res, 404, { error: 'Request not found' });
        return;
      }
      if (normalizeEmail(certificate?.certificateDraft?.email) !== normalizeEmail(patient.email)) {
        sendJson(res, 403, { error: 'Forbidden' });
        return;
      }
      if (!isApprovedCertificate(certificate)) {
        sendJson(res, 409, { error: 'Certificate is not ready yet' });
        return;
      }

      const pdfBuffer = await buildCertificatePdf(certificate, {
        doctorName: certificate?.decision?.by || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
        doctorNotes: certificate?.decision?.notes || '',
        providerType: certificate?.decision?.providerType || '',
        registrationNumber: certificate?.decision?.registrationNumber || '',
        verificationCode: getCertificateVerificationCode(certificate),
        verifyUrl: `${getFrontendBaseUrl(req)}/verify?code=${encodeURIComponent(getCertificateVerificationCode(certificate))}`,
      });

      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="medical-certificate-${certificate.id}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/register') {
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

      const supabaseConfig = getSupabaseConfig();
      if (supabaseConfig.enabled) {
        await registerDoctorAccount({
          email,
          password,
          fullName,
          providerType,
          registrationNumber,
        });
      }

      let account;
      try {
        account = await createDoctorAccount({
          email,
          password,
          fullName,
          providerType,
          registrationNumber,
          source: supabaseConfig.enabled ? 'supabase-signup' : 'portal-signup',
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

      try {
        const welcomeEmail = renderDoctorWelcomeEmail({
          baseUrl: getFrontendBaseUrl(req),
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

      await appendAudit({
        type: 'DOCTOR_ACCOUNT_CREATED',
        email,
      });

      const token = issueDoctorToken(email);
      info('doctor.register.success', { email });
      sendJson(res, 201, {
        token,
        doctor: {
          email,
          name: account.fullName || fullName || email,
          providerType: account.providerType || providerType,
          registrationNumber: account.registrationNumber || registrationNumber,
        },
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/password/reset/request') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);

      if (!isLikelyDoctorEmail(email)) {
        sendJson(res, 400, { error: 'A valid email is required' });
        return;
      }

      const supabaseDoctor = await findSupabaseDoctorByEmail(email);
      if (supabaseDoctor?.email) {
        await upsertDoctorAccount({
          email: supabaseDoctor.email,
          fullName: supabaseDoctor.fullName || '',
          providerType: supabaseDoctor.providerType || '',
          registrationNumber: supabaseDoctor.registrationNumber || '',
          source: 'supabase',
        });
      }

      const resetPayload = await issueDoctorPasswordResetToken(email, DOCTOR_PASSWORD_RESET_TTL_MS);
      if (resetPayload) {
        const resetUrl = buildDoctorPasswordResetUrl(req, resetPayload.token);
        const resetEmail = renderDoctorPasswordResetEmail({
          baseUrl: getFrontendBaseUrl(req),
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

    if (req.method === 'POST' && routePath === 'doctor/password/reset/confirm') {
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

      const supabaseConfig = getSupabaseConfig();
      if (supabaseConfig.enabled) {
        try {
          await updateSupabaseDoctorPasswordByEmail(account.email, nextPassword);
        } catch (errorObject) {
          info('doctor.password_reset.supabase_sync_failed', {
            email: account.email,
            message: errorObject?.message || String(errorObject),
          });
        }
      }

      await appendAudit({
        type: 'DOCTOR_PASSWORD_RESET_COMPLETED',
        email: account.email,
      });

      const authToken = issueDoctorToken(account.email);
      info('doctor.password_reset.completed', { email: account.email });
      sendJson(res, 200, {
        token: authToken,
        doctor: {
          email: account.email,
          name: account.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
          providerType: account.providerType || '',
          registrationNumber: account.registrationNumber || '',
        },
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/login') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');

      let authenticatedDoctor = null;
      if (validateDoctorCredentials(email, password)) {
        authenticatedDoctor = {
          email,
          name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
          providerType: '',
          registrationNumber: '',
        };
      } else {
        const localAuth = await authenticateDoctorAccount({ email, password });
        if (localAuth?.email) {
          authenticatedDoctor = {
            email: localAuth.email,
            name: localAuth.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
            providerType: localAuth.providerType || '',
            registrationNumber: localAuth.registrationNumber || '',
          };
        }

        const supabaseAuth = await authenticateDoctorViaSupabase(email, password);
        if (!authenticatedDoctor && supabaseAuth?.email) {
          authenticatedDoctor = {
            email: supabaseAuth.email,
            name: supabaseAuth.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
            providerType: supabaseAuth.providerType || '',
            registrationNumber: supabaseAuth.registrationNumber || '',
          };
        }

        if (supabaseAuth?.email) {
          await upsertDoctorAccount({
            email: supabaseAuth.email,
            fullName: supabaseAuth.fullName || '',
            providerType: supabaseAuth.providerType || '',
            registrationNumber: supabaseAuth.registrationNumber || '',
            source: 'supabase',
          });
        }
      }

      if (!authenticatedDoctor) {
        sendJson(res, 401, { error: 'Invalid credentials' });
        return;
      }

      const token = issueDoctorToken(authenticatedDoctor.email);
      info('doctor.login.success', { email: authenticatedDoctor.email });
      sendJson(res, 200, {
        token,
        doctor: {
          email: authenticatedDoctor.email,
          name: authenticatedDoctor.name,
          providerType: authenticatedDoctor.providerType || '',
          registrationNumber: authenticatedDoctor.registrationNumber || '',
        },
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'doctor/profile') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const profile = await resolveDoctorProfile(doctor.email);
      sendJson(res, 200, {
        doctor: {
          email: normalizeEmail(doctor.email),
          fullName: String(profile?.fullName || '').trim(),
          providerType: String(profile?.providerType || '').trim(),
          registrationNumber: String(profile?.registrationNumber || '').trim().toUpperCase(),
        },
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'doctor/profile') {
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
        source: 'portal-profile',
      });

      if (getSupabaseConfig().enabled) {
        try {
          await upsertSupabaseDoctorMetadata({
            email: normalizeEmail(doctor.email),
            fullName,
            providerType,
            registrationNumber,
          });
        } catch (errorObject) {
          info('doctor.profile.supabase_sync_failed', {
            email: normalizeEmail(doctor.email),
            message: errorObject?.message || String(errorObject),
          });
        }
      }

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
        },
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'doctor/certificates') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const statusFilter = getStatusFilterFromUrl(url);
      const items = await listCertificates();

      const filtered = items
        .filter((item) => {
          if (!statusFilter) return true;
          if (statusFilter === 'pending') {
            return isOpenForReview(item.status);
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
          assignedTo: item?.rawSubmission?.workflow?.assignedTo || null,
        }));

      sendJson(res, 200, {
        doctor: doctor.email,
        count: filtered.length,
        certificates: filtered,
      });
      return;
    }

    if (req.method === 'GET' && segments.length === 3 && segments[0] === 'doctor' && segments[1] === 'certificates') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'assign') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }
      if (!isOpenForReview(current.status)) {
        sendJson(res, 409, { error: 'Certificate already reviewed', status: current.status });
        return;
      }

      const updated = await updateCertificate(certId, (item) => ({
        ...item,
        status: 'assigned',
        rawSubmission: {
          ...(item.rawSubmission || {}),
          workflow: {
            ...(item.rawSubmission?.workflow || {}),
            assignedTo: doctor.email,
            assignedAt: new Date().toISOString(),
          },
        },
      }));

      await appendAudit({
        type: 'CERTIFICATE_ASSIGNED',
        certificateId: certId,
        by: doctor.email,
      });

      sendJson(res, 200, {
        message: 'Certificate assigned to you',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'close') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }

      if (!['approved', 'denied'].includes(String(current.status || '').toLowerCase())) {
        sendJson(res, 409, {
          error: 'Approve or deny the certificate before closing it',
          status: current.status,
        });
        return;
      }

      const updated = await updateCertificate(certId, (item) => ({
        ...item,
        rawSubmission: {
          ...(item.rawSubmission || {}),
          workflow: {
            ...(item.rawSubmission?.workflow || {}),
            closedBy: doctor.email,
            closedAt: new Date().toISOString(),
          },
        },
      }));

      await appendAudit({
        type: 'CERTIFICATE_CLOSED',
        certificateId: certId,
        by: doctor.email,
      });

      sendJson(res, 200, {
        message: 'Certificate closed',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'auto-notes') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'more-info') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const certId = decodeURIComponent(segments[2]);
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

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'request-more-info') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;
      const doctorProfile = await resolveDoctorProfile(doctor.email);
      const reviewerName = resolveDoctorDisplayName(doctorProfile, doctor.email);

      const certId = decodeURIComponent(segments[2]);
      const body = await parseJsonBody(req);
      const notes = String(body.notes || '').trim();

      if (!notes) {
        sendJson(res, 400, { error: 'Please add notes before requesting more information' });
        return;
      }

      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }
      if (!isOpenForReview(current.status)) {
        sendJson(res, 409, {
          error: 'Certificate already reviewed',
          status: current.status,
        });
        return;
      }

      const updated = await updateCertificate(certId, (item) => ({
        ...item,
        status: 'in_review',
        decision: {
          ...(item.decision || {}),
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

      await appendAudit({
        type: 'MORE_INFO_REQUESTED',
        certificateId: updated.id,
        by: doctor.email,
        notes,
      });
      await sendPatientMoreInfoEmail(updated, doctor.email, notes);

      sendJson(res, 200, {
        message: 'More information request sent to patient',
        certificate: doctorPayloadFromRequest(updated),
      });
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'pdf-preview') {
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

      const certId = decodeURIComponent(segments[2]);
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
        verifyUrl: `${getFrontendBaseUrl(req)}/verify?code=${encodeURIComponent(getCertificateVerificationCode(previewCertificate))}`,
        isPreview: true,
      });

      res.status(200);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
      res.send(pdfBuffer);
      return;
    }

    if (req.method === 'POST' && segments.length === 4 && segments[0] === 'doctor' && segments[1] === 'certificates' && segments[3] === 'decision') {
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

      const certId = decodeURIComponent(segments[2]);
      const body = await parseJsonBody(req);
      const decision = body.decision === 'approved' ? 'approved' : body.decision === 'denied' ? 'denied' : null;
      const notes = String(body.notes || '').trim();

      if (!decision) {
        sendJson(res, 400, { error: 'Decision must be approved or denied' });
        return;
      }

      const current = await getCertificateById(certId);
      if (!current) {
        sendJson(res, 404, { error: 'Certificate not found' });
        return;
      }
      if (!isOpenForReview(current.status)) {
        sendJson(res, 409, {
          error: 'Certificate already reviewed',
          status: current.status,
        });
        return;
      }

      const updated = await updateCertificate(certId, (item) => {
        if (!isOpenForReview(item.status)) return item;

        return {
          ...item,
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
  } catch (err) {
    error('api.request.failed', {
      method: req.method,
      routePath,
      message: err?.message || String(err),
      status: err?.status || null,
      data: err?.data || null,
    });
    sendJson(res, err?.status || 500, { error: err?.message || 'Internal server error' });
  }
}
