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
  isDoctorAccountApproved,
  isLikelyEmail as isLikelyDoctorEmail,
  issueDoctorPasswordResetToken,
  listDoctorEmails,
  resetDoctorPasswordWithToken,
  setDoctorAccountApprovalStatus,
  upsertDoctorAccount,
} from '../backend/lib/doctor-auth.js';
import { calculateRisk } from '../backend/lib/risk.js';
import { buildCertificatePdf } from '../backend/lib/pdf.js';
import { generateDoctorNotes, generateMoreInfoDraft } from '../backend/lib/notes.js';
import {
  generateOpenAiMealPlanWithGeneratedRecipes,
  generateFallbackMealPlan,
} from '../backend/lib/meal-plan-ai.js';
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
  listCertificates,
  listCertificatesByPatientEmail,
  listMealPlannerRecipesByIds,
  upsertMealPlanGenerationCache,
  upsertMealPlannerRecipes,
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
  renderPatientMagicLinkEmail,
  renderPatientMoreInfoEmail,
  renderPatientPasswordResetEmail,
  renderPatientWelcomeEmail,
} from '../backend/lib/email-templates.js';
import { error, info } from '../backend/lib/logger.js';
import {
  getPatientCertificatesForEmail,
} from './lib/patient-snapshot.js';

const CORS_ORIGIN = String(process.env.CORS_ORIGIN || '*').trim();
const FRONTEND_BASE_URL = (process.env.FRONTEND_BASE_URL || '').replace(/\/$/, '');
const APP_BASE_URL = (process.env.APP_BASE_URL || '').replace(/\/$/, '');

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
const STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_ONE_OFF || 'prod_U3xXc0tzo0FJQs';
const STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING =
  process.env.STRIPE_PRICE_PRODUCT_MULTI_DAY_RECURRING || 'prod_U3xTbAyYCjVi3J';
const CERTIFICATE_TIME_ZONE = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane';

const STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_SINGLE_DAY_AUD_CENTS || 971);
const STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_MULTI_DAY_AUD_CENTS || 2971);
const STRIPE_AMOUNT_RECURRING_AUD_CENTS = Number(process.env.STRIPE_AMOUNT_RECURRING_AUD_CENTS || 1900);
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
const PATIENT_PASSWORD_RESET_SIGNING_SECRET =
  process.env.PATIENT_PASSWORD_RESET_SIGNING_SECRET ||
  process.env.PATIENT_SESSION_SECRET ||
  process.env.DOCTOR_SESSION_SECRET ||
  'change-this-patient-reset-secret';
const PATIENT_MAGIC_LINK_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.PATIENT_MAGIC_LINK_TTL_MS || 1000 * 60 * 30)
);
const PATIENT_EMAIL_CHANGE_TTL_MS = Math.max(
  1000 * 60 * 5,
  Number(process.env.PATIENT_EMAIL_CHANGE_TTL_MS || 1000 * 60 * 30)
);
const PATIENT_PROFILE_CACHE_TTL_MS = Math.max(
  1000 * 10,
  Number(process.env.PATIENT_PROFILE_CACHE_TTL_MS || 1000 * 60)
);
const MEAL_PLAN_IMAGE_PROXY_SIGNING_SECRET =
  process.env.MEAL_PLAN_IMAGE_PROXY_SIGNING_SECRET ||
  PATIENT_PASSWORD_RESET_SIGNING_SECRET ||
  'change-this-meal-image-secret';
const MEAL_PLAN_IMAGE_PROXY_PATH = '/api/patient/meal-plan/recipe-image';
const WEIGHT_LOSS_IMAGE_BUCKET = String(process.env.WEIGHT_LOSS_IMAGE_BUCKET || 'weight-loss-reset-images').trim();
const PROFILE_IMAGE_BUCKET = String(process.env.PATIENT_PROFILE_IMAGE_BUCKET || WEIGHT_LOSS_IMAGE_BUCKET).trim();
const OPENAI_API_KEY = String(process.env.OPENAI_API_KEY || '').trim();
const MEAL_PLAN_FEATURE_ENABLED = ['1', 'true', 'yes'].includes(
  String(process.env.ENABLE_MEAL_PLAN_FEATURE || '').trim().toLowerCase()
);
const OPENAI_TTS_ENDPOINT = 'https://api.openai.com/v1/audio/speech';
const OPENAI_TTS_MODEL = String(process.env.OPENAI_TTS_MODEL || 'gpt-4o-mini-tts').trim() || 'gpt-4o-mini-tts';
const OPENAI_TTS_RESPONSE_FORMAT = 'mp3';
const OPENAI_TTS_MAX_SCRIPT_CHARS = Math.max(900, Number(process.env.OPENAI_TTS_MAX_SCRIPT_CHARS || 3200));
const DEFAULT_DIETITIAN_ID = '9f1f2a68-3b9c-4f2f-8da9-3e7e1c7f1c11';
const DEFAULT_DIETITIAN_NAME = 'Felicity';
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
  'patient/profile/email-change/request',
  'patient/profile/email-change/consume',
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
const patientProfileCache = new Map();

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
  if (!res.getHeader('Cache-Control')) {
    res.setHeader('Cache-Control', 'private, no-store, max-age=0, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
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

function normalizePhoneForLookup(value) {
  return String(value || '')
    .trim()
    .replace(/[^\d+]/g, '')
    .replace(/^00/, '+')
    .toLowerCase();
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
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
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

function sanitizeOnboardingAnswersForBundle(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return null;
  const safeAnswers = answers;
  const selectedMealTypes = normalizeCoreMealTypesForCache(safeAnswers.selectedMealTypes);
  const mealsPerDay =
    selectedMealTypes.length >= 2
      ? selectedMealTypes.length
      : Math.max(2, Math.min(3, Math.round(Number(safeAnswers.mealsPerDay || 3))));

  return {
    firstName: String(safeAnswers.firstName || '').trim().slice(0, 64),
    age: Math.round(clampNumberForCache(safeAnswers.age, 10, 99, 0)) || undefined,
    gender: String(safeAnswers.gender || '').trim().slice(0, 24) || undefined,
    heightCm: Math.round(clampNumberForCache(safeAnswers.heightCm, 100, 240, 0)) || undefined,
    currentWeightKg: Math.round(clampNumberForCache(safeAnswers.currentWeightKg, 30, 260, 0) * 10) / 10 || undefined,
    goalWeightKg: Math.round(clampNumberForCache(safeAnswers.goalWeightKg, 30, 260, 0) * 10) / 10 || undefined,
    mainGoal: String(safeAnswers.mainGoal || '').trim().slice(0, 220) || undefined,
    motivation: String(safeAnswers.motivation || '').trim().slice(0, 260) || undefined,
    timeframeWeeks: Math.round(clampNumberForCache(safeAnswers.timeframeWeeks, 1, 104, 0)) || undefined,
    biggestChallenge: String(safeAnswers.biggestChallenge || '').trim().slice(0, 120) || undefined,
    primaryHealthFocus: String(safeAnswers.primaryHealthFocus || '').trim().slice(0, 120) || undefined,
    dietaryRequirements: Array.isArray(safeAnswers.dietaryRequirements)
      ? safeAnswers.dietaryRequirements.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 16)
      : [],
    favoriteFoods: Array.isArray(safeAnswers.favoriteFoods)
      ? safeAnswers.favoriteFoods.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 20)
      : [],
    allergiesText: String(safeAnswers.allergiesText || '').trim().slice(0, 320) || undefined,
    allergyChips: Array.isArray(safeAnswers.allergyChips)
      ? safeAnswers.allergyChips.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 20)
      : [],
    dislikes: String(safeAnswers.dislikes || '').trim().slice(0, 320) || undefined,
    cookingSkill: String(safeAnswers.cookingSkill || '').trim().slice(0, 80) || undefined,
    availableEquipment: resolveAvailableEquipmentForCache(safeAnswers.availableEquipment),
    selectedMealTypes,
    mealsPerDay,
    daysPerWeek: Math.round(clampNumberForCache(safeAnswers.daysPerWeek, 2, 7, 7)),
    budgetPreference: String(safeAnswers.budgetPreference || '').trim().slice(0, 80) || undefined,
    groceryPreference: String(safeAnswers.groceryPreference || '').trim().slice(0, 120) || undefined,
    prepDay: String(safeAnswers.prepDay || '').trim().slice(0, 32) || undefined,
    preferredMealStyle: String(safeAnswers.preferredMealStyle || '').trim().slice(0, 120) || undefined,
    preferredCuisines: Array.isArray(safeAnswers.preferredCuisines)
      ? safeAnswers.preferredCuisines.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 16)
      : [],
    supportWanted: String(safeAnswers.supportWanted || '').trim().slice(0, 24) || undefined,
    supportAreas: Array.isArray(safeAnswers.supportAreas)
      ? safeAnswers.supportAreas.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, 16)
      : [],
  };
}

function normalizePodcastVoiceProfile(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'authoritative_male') return 'authoritative_male';
  return 'happy_female';
}

function resolvePodcastVoice(profile) {
  return profile === 'authoritative_male' ? 'cedar' : 'marin';
}

function resolvePodcastInstructions(profile) {
  if (profile === 'authoritative_male') {
    return 'Speak with calm authority, clear pacing, and confident but supportive delivery. Keep a human bedside manner.';
  }
  return 'Speak with a warm, happy, reassuring tone. Keep the pacing natural, encouraging, and personal.';
}

function sanitizePodcastScript(value) {
  return String(value || '')
    .replace(/[\u0000-\u001f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, OPENAI_TTS_MAX_SCRIPT_CHARS);
}

function estimateSpeechDurationSeconds(script) {
  const words = sanitizePodcastScript(script)
    .split(/\s+/g)
    .filter(Boolean).length;
  if (!words) return 0;
  return Math.max(20, Math.round(words / 2.35));
}

function toDisplayList(items) {
  const safe = (Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean);
  if (safe.length === 0) return '';
  if (safe.length === 1) return safe[0];
  if (safe.length === 2) return `${safe[0]} and ${safe[1]}`;
  return `${safe.slice(0, -1).join(', ')}, and ${safe[safe.length - 1]}`;
}

function getWeekStartIsoKey(date = new Date()) {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);
  const day = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - day);
  const year = normalized.getFullYear();
  const month = String(normalized.getMonth() + 1).padStart(2, '0');
  const dayOfMonth = String(normalized.getDate()).padStart(2, '0');
  return `${year}-${month}-${dayOfMonth}`;
}

function collectMealPlanHighlightTokens(mealPlan) {
  if (!mealPlan || typeof mealPlan !== 'object' || !Array.isArray(mealPlan.days)) return [];
  const picks = [];
  for (const day of mealPlan.days) {
    const ids = [day?.meals?.breakfast, day?.meals?.lunch, day?.meals?.dinner, ...(Array.isArray(day?.meals?.snacks) ? day.meals.snacks : [])];
    for (const recipeId of ids) {
      const token = String(recipeId || '').trim();
      if (!token) continue;
      if (picks.includes(token)) continue;
      picks.push(token);
      if (picks.length >= 3) return picks;
    }
  }
  return picks;
}

function buildFallbackPodcastScript({
  answers,
  weekNumber,
  firstName,
  mealPlan,
  mealHighlights,
  focusLabel,
}) {
  const safeFirstName = String(firstName || answers?.firstName || 'there').trim() || 'there';
  const safeFocus = String(focusLabel || answers?.primaryHealthFocus || 'overall nutrition').trim() || 'overall nutrition';
  const mainGoal = String(answers?.mainGoal || '').trim() || 'your goal';
  const dietary = toDisplayList((answers?.dietaryRequirements || []).slice(0, 3));
  const dietaryLine = dietary ? `We kept your meals aligned with ${dietary}.` : 'We kept your meals practical and easy to repeat.';
  const explicitMealHighlights = Array.isArray(mealHighlights)
    ? mealHighlights.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 4)
    : [];
  const mealTokens = explicitMealHighlights.length > 0 ? explicitMealHighlights : collectMealPlanHighlightTokens(mealPlan);
  const mealLine = mealTokens.length > 0
    ? `Your week includes ${toDisplayList(mealTokens.slice(0, 2))} as anchors for consistency.`
    : 'Your week has structured meal anchors to reduce decision fatigue.';

  return sanitizePodcastScript(
    [
      `Hi ${safeFirstName}, welcome to your personal science podcast for week ${weekNumber || 1}.`,
      `Your focus this week is ${safeFocus}, and your plan is designed around ${mainGoal}.`,
      dietaryLine,
      mealLine,
      'At a physiology level, consistent protein distribution supports muscle protein synthesis, fiber supports satiety and glycemic control, and predictable meal timing supports metabolic stability.',
      'At a behavior level, repeatable meals reduce decision fatigue and improve adherence, which is one of the strongest predictors of long-term outcomes.',
      'This week, monitor your post-meal energy, hunger stability, and recovery quality, then use those signals to guide precise adjustments rather than making random changes.',
      'Stay consistent, stay flexible, and make small evidence-based refinements across the week.',
    ].join(' ')
  );
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

function buildMealPlanGenerationHistoryCacheKey({ patientEmail, intakeHash, seedSalt = '' }) {
  const normalizedEmail = normalizeEmail(patientEmail);
  const normalizedHash = String(intakeHash || '').trim().toLowerCase();
  if (!normalizedEmail || !normalizedHash) return '';
  const saltFragment = String(seedSalt || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '')
    .slice(0, 24);
  const runtimeSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const runId = [saltFragment, runtimeSuffix].filter(Boolean).join('-').slice(0, 52);
  return `mealplan:${normalizedEmail}:${normalizedHash}:run:${runId}`;
}

function normalizeRecipeIdList(value, limit = 1200) {
  const source = Array.isArray(value) ? value : [];
  const max = Math.max(1, Math.min(2000, Number(limit || 1200)));
  const output = [];
  const seen = new Set();
  for (const entry of source) {
    const id = String(entry || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= max) break;
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

const SUPPORTED_RECIPE_DATA_IMAGE_MIMES = new Set([
  'image/webp',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/avif',
]);

const SUPPORTED_RECIPE_HTTP_IMAGE_EXTENSIONS = new Set(['webp', 'png', 'jpg', 'jpeg', 'gif', 'avif']);

function parseSupportedRecipeDataImageUri(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const match = candidate.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const mime = String(match[1] || '').trim().toLowerCase();
  if (!SUPPORTED_RECIPE_DATA_IMAGE_MIMES.has(mime)) return null;
  const body = String(match[2] || '').replace(/\s+/g, '').trim();
  if (!body) return null;
  return { mime, body };
}

function isWebpDataUri(value) {
  return Boolean(parseSupportedRecipeDataImageUri(value));
}

function isWebpHttpImage(value) {
  const candidate = String(value || '').trim();
  if (!/^https?:\/\//i.test(candidate)) return false;
  try {
    const parsed = new URL(candidate);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    if (hostname.includes('dietitiansaustralia.org.au')) return false;
    const pathname = String(parsed.pathname || '').toLowerCase();
    const extensionMatch = pathname.match(/\.([a-z0-9]+)$/i);
    if (extensionMatch && SUPPORTED_RECIPE_HTTP_IMAGE_EXTENSIONS.has(String(extensionMatch[1] || '').toLowerCase())) {
      return true;
    }

    const formatCandidate = String(parsed.searchParams.get('fm') || parsed.searchParams.get('format') || '')
      .trim()
      .toLowerCase();
    if (formatCandidate && SUPPORTED_RECIPE_HTTP_IMAGE_EXTENSIONS.has(formatCandidate)) {
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

function normalizeRecipeImageToWebp(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (isWebpDataUri(candidate)) return candidate;
  if (isWebpHttpImage(candidate)) return candidate;
  return '';
}

function signMealPlanRecipeImageId(recipeId) {
  const normalizedId = String(recipeId || '').trim();
  if (!normalizedId) return '';
  return crypto
    .createHmac('sha256', MEAL_PLAN_IMAGE_PROXY_SIGNING_SECRET)
    .update(normalizedId)
    .digest('base64url');
}

function isValidMealPlanRecipeImageSignature(recipeId, signature) {
  const expected = signMealPlanRecipeImageId(recipeId);
  const candidate = String(signature || '').trim();
  if (!expected || !candidate) return false;

  const expectedBuffer = Buffer.from(expected, 'utf8');
  const candidateBuffer = Buffer.from(candidate, 'utf8');
  if (expectedBuffer.length !== candidateBuffer.length) return false;

  try {
    return crypto.timingSafeEqual(expectedBuffer, candidateBuffer);
  } catch {
    return false;
  }
}

function buildMealPlanRecipeImageProxyUrl(req, recipeId) {
  const normalizedId = String(recipeId || '').trim();
  if (!normalizedId) return '';
  const signature = signMealPlanRecipeImageId(normalizedId);
  if (!signature) return '';
  return `${getAppBaseUrl(req)}${MEAL_PLAN_IMAGE_PROXY_PATH}?recipeId=${encodeURIComponent(normalizedId)}&sig=${encodeURIComponent(
    signature
  )}`;
}

function resolveRecipeImageUrlForClient(req, recipe, { inlineDataImages = false } = {}) {
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source
    : {};
  const candidate = normalizeRecipeImageToWebp(String(recipe?.imageUrl || source.image_url || source.imageUrl || '').trim());
  if (!candidate) return '';
  if (isWebpDataUri(candidate)) {
    if (inlineDataImages) return candidate;
    return buildMealPlanRecipeImageProxyUrl(req, recipe?.id);
  }
  return candidate;
}

function mapRecipeForClient(recipe, req, options = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return null;
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? { ...recipe.source }
    : {};
  const imageUrl = resolveRecipeImageUrlForClient(req, recipe, options);
  if (imageUrl) {
    source.image_url = imageUrl;
    source.imageUrl = imageUrl;
  } else {
    delete source.image_url;
    delete source.imageUrl;
  }
  return {
    ...recipe,
    imageUrl: imageUrl || undefined,
    source,
  };
}

function mapRecipeListForClient(recipes, req, options = {}) {
  return (Array.isArray(recipes) ? recipes : [])
    .map((recipe) => mapRecipeForClient(recipe, req, options))
    .filter((recipe) => Boolean(recipe && recipe.id));
}

function inferRecipeRequiredEquipmentFromText(value) {
  const text = normalizeStringForCache(value, 2000);
  if (!text) return [];
  const inferred = new Set();
  if (/\bair[-\s]?fry(?:er|ing)?\b/.test(text)) inferred.add('air fryer');
  if (/\b(oven|preheat|bake|baked|roast|roasted|broil)\b/.test(text)) inferred.add('oven');
  if (/\bmicrowave|microwavable\b/.test(text)) inferred.add('microwave');
  if (/\b(stovetop|stove|hob|pan|skillet|saucepan|pot|boil|simmer|saute|stir[-\s]?fry|grill)\b/.test(text)) {
    inferred.add('stovetop');
  }
  return COOKING_EQUIPMENT_ORDER.filter((entry) => inferred.has(entry));
}

function resolveRecipeRequiredEquipmentForProduct(recipe, source) {
  const explicit = normalizeCookingEquipmentListForCache(recipe?.requiredEquipment);
  if (explicit.length > 0) return explicit;
  const fromSource = normalizeCookingEquipmentListForCache(
    source?.requiredEquipment ?? source?.required_equipment ?? source?.equipment
  );
  if (fromSource.length > 0) return fromSource;
  return inferRecipeRequiredEquipmentFromText(
    [
      recipe?.title || '',
      recipe?.description || '',
      ...(Array.isArray(recipe?.instructions) ? recipe.instructions : []),
    ].join(' ')
  );
}

function normalizeInstructionLineForProduct(value) {
  return String(value || '')
    .replace(/^step\s*\d+\s*[:.)-]?\s*/i, '')
    .replace(/^\d+\s*[:.)-]\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeRecipeForProduct(recipe, { generatedBy = '' } = {}) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return null;
  const id = String(recipe?.id || '').trim();
  const title = String(recipe?.title || '').trim();
  const ingredients = Array.isArray(recipe?.ingredients) ? recipe.ingredients : [];
  if (!id || !title || ingredients.length === 0) return null;

  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? { ...recipe.source }
    : {};
  const sourceImage = String(source.image_url || source.imageUrl || '').trim();
  const imageUrl = normalizeRecipeImageToWebp(String(recipe?.imageUrl || '').trim()) || normalizeRecipeImageToWebp(sourceImage);
  if (imageUrl) {
    source.image_url = imageUrl;
    source.imageUrl = imageUrl;
  } else {
    delete source.image_url;
    delete source.imageUrl;
  }

  const normalizedGeneratedBy = String(generatedBy || '').trim().toLowerCase();
  if (normalizedGeneratedBy === 'openai') {
    source.generatedBy = 'openai';
    if (!String(source.provider || '').trim()) {
      source.provider = 'openai';
    }
  }
  if (normalizedGeneratedBy === 'rules') {
    if (!String(source.generatedBy || '').trim()) {
      source.generatedBy = 'rules';
    }
    if (!String(source.provider || '').trim()) {
      source.provider = 'rules-generated';
    }
  }

  const instructions = (Array.isArray(recipe?.instructions) ? recipe.instructions : [])
    .map((entry) => normalizeInstructionLineForProduct(entry))
    .filter(Boolean);

  const requiredEquipment = resolveRecipeRequiredEquipmentForProduct(recipe, source);

  return {
    ...recipe,
    id,
    title,
    ingredients,
    instructions,
    dietaryTags: Array.isArray(recipe?.dietaryTags) ? recipe.dietaryTags : [],
    allergens: Array.isArray(recipe?.allergens) ? recipe.allergens : [],
    requiredEquipment,
    imageUrl: imageUrl || undefined,
    source,
  };
}

function normalizeRecipeListForProduct(recipes, { generatedBy = '' } = {}) {
  const output = [];
  const seen = new Set();
  for (const recipe of Array.isArray(recipes) ? recipes : []) {
    const normalized = normalizeRecipeForProduct(recipe, { generatedBy });
    if (!normalized) continue;
    if (seen.has(normalized.id)) continue;
    seen.add(normalized.id);
    output.push(normalized);
  }
  return output;
}

function compactRecipeForCacheBundle(recipe) {
  const normalized = normalizeRecipeForProduct(recipe);
  if (!normalized) return null;
  const source = normalized.source && typeof normalized.source === 'object' && !Array.isArray(normalized.source)
    ? { ...normalized.source }
    : {};
  const imageCandidate = String(normalized.imageUrl || '').trim();
  const imageUrl = /^https?:\/\//i.test(imageCandidate) ? imageCandidate : '';
  delete source.image_url;
  delete source.imageUrl;
  delete source.imagePrompt;

  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description,
    ingredients: normalized.ingredients,
    instructions: normalized.instructions,
    calories: normalized.calories,
    protein: normalized.protein,
    carbs: normalized.carbs,
    fat: normalized.fat,
    mealType: normalized.mealType,
    requiredEquipment: normalized.requiredEquipment,
    dietaryTags: normalized.dietaryTags,
    allergens: normalized.allergens,
    imageUrl: imageUrl || undefined,
    prepTimeMinutes: normalized.prepTimeMinutes,
    cookTimeMinutes: normalized.cookTimeMinutes,
    totalTimeMinutes: normalized.totalTimeMinutes,
    serves: normalized.serves,
    estimatedCost: normalized.estimatedCost,
    source,
  };
}

function isLikelyGeneratedRecipe(recipe) {
  const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
    ? recipe.source
    : {};
  const provider = String(
    source.provider ||
      source.generatedBy ||
      source.origin ||
      source.generator ||
      source.label ||
      ''
  )
    .trim()
    .toLowerCase();
  const sourceUrl = String(source.url || '').trim().toLowerCase();
  if (provider.includes('dietitians-australia') || sourceUrl.includes('dietitiansaustralia.org.au')) return false;
  if (provider.includes('openai') || provider.includes('rules-generated') || provider.includes('ai-generated')) {
    return true;
  }
  if (provider === 'rules') return true;
  if (String(source.generatedBy || '').trim().toLowerCase() === 'openai') return true;
  if (String(source.generatedBy || '').trim().toLowerCase() === 'rules') return true;
  if (provider.includes('generated')) return true;
  if (String(source.stage || '').toLowerCase().includes('ai_recipes')) return true;
  if (String(source.model || '').trim().toLowerCase().startsWith('gpt')) return true;
  return false;
}

function buildMealPlanCacheBundle({ mealPlan, recipes, onboardingAnswers = null }) {
  const normalizedRecipes = normalizeRecipeListForProduct(recipes);
  const recipeIds = normalizeRecipeIdList([
    ...normalizeRecipeIdList(normalizedRecipes.map((recipe) => recipe.id)),
    ...extractRecipeIdsFromMealPlan(mealPlan),
  ]);
  if (!mealPlan || recipeIds.length === 0) return null;
  const recipesById = new Map(normalizedRecipes.map((recipe) => [recipe.id, recipe]));
  const compactRecipes = recipeIds
    .map((id) => compactRecipeForCacheBundle(recipesById.get(id)))
    .filter(Boolean);

  return {
    mealPlan,
    recipeIds,
    recipes: compactRecipes,
    onboardingAnswers: sanitizeOnboardingAnswersForBundle(onboardingAnswers) || undefined,
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
  const dislikeSource = [
    ...tokenizeFreeTextForCache(answers?.dislikes),
  ];
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

function buildRuleFallbackBundleFromCatalog({ recipes, answers, includeSnack, seedSalt }) {
  const catalog = Array.isArray(recipes) ? recipes.filter((recipe) => recipe && recipe.id && recipe.title) : [];
  if (catalog.length === 0) return null;
  const catalogWithImages = catalog.filter((recipe) => {
    const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
      ? recipe.source
      : {};
    return Boolean(normalizeRecipeImageToWebp(recipe?.imageUrl || source.image_url || source.imageUrl));
  });
  if (catalogWithImages.length === 0) return null;

  const constraints = extractAnswerConstraintTokens(answers);
  const filtered = catalogWithImages.filter((recipe) => recipeMatchesHardConstraints(recipe, constraints));
  const candidateCatalog = filtered.length >= 18 ? filtered : catalogWithImages;
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

async function hydrateMealPlanBundleFromCacheEntry(entry) {
  const bundle = entry?.bundle;
  if (!bundle || typeof bundle !== 'object') return null;
  const mealPlan = bundle.mealPlan && typeof bundle.mealPlan === 'object' && !Array.isArray(bundle.mealPlan) ? bundle.mealPlan : null;
  if (!mealPlan) return null;
  const onboardingAnswers = sanitizeOnboardingAnswersForBundle(
    bundle.onboardingAnswers || bundle.onboarding_answers || bundle.answers || null
  );

  const recipeIds = normalizeRecipeIdList([
    ...normalizeRecipeIdList(bundle.recipeIds ?? bundle.recipe_ids),
    ...extractRecipeIdsFromMealPlan(mealPlan),
  ]);
  if (recipeIds.length === 0) return null;

  const legacyRecipes = normalizeRecipeListForProduct(Array.isArray(bundle.recipes) ? bundle.recipes : []).filter((recipe) =>
    isLikelyGeneratedRecipe(recipe)
  );
  const legacyById = new Map(
    legacyRecipes
      .filter((recipe) => recipe && typeof recipe === 'object')
      .map((recipe) => [String(recipe.id || '').trim(), recipe])
      .filter(([id]) => Boolean(id))
  );
  const hasCompleteLegacyRecipes = recipeIds.every((id) => legacyById.has(id));
  const persistedRecipes = hasCompleteLegacyRecipes ? [] : await listMealPlannerRecipesByIds(recipeIds).catch(() => []);
  const persistedById = new Map(persistedRecipes.filter((recipe) => recipe?.id).map((recipe) => [recipe.id, recipe]));

  const legacyRecipesToPersist = recipeIds
    .filter((id) => !persistedById.has(id) && legacyById.has(id))
    .map((id) => legacyById.get(id))
    .filter((recipe) => recipe && typeof recipe === 'object');
  if (legacyRecipesToPersist.length > 0) {
    const normalizedLegacyRecipes = normalizeRecipeListForProduct(legacyRecipesToPersist);
    if (normalizedLegacyRecipes.length > 0) {
      void upsertMealPlannerRecipes(normalizedLegacyRecipes).catch((errorObject) => {
        error('meal_plan.hydrate_backfill_recipes_failed', {
          cacheKey: String(entry?.cacheKey || entry?.cache_key || ''),
          message: errorObject?.message || String(errorObject),
        });
      });
      for (const recipe of normalizedLegacyRecipes) {
        persistedById.set(recipe.id, recipe);
      }
    }
  }

  const hydratedRecipes = recipeIds
    .map((id) => persistedById.get(id) || legacyById.get(id))
    .filter((recipe) => recipe && typeof recipe === 'object');
  const normalizedHydratedRecipes = normalizeRecipeListForProduct(hydratedRecipes).filter((recipe) =>
    isLikelyGeneratedRecipe(recipe)
  );
  if (normalizedHydratedRecipes.length === 0) return null;

  const hydratedById = new Set(normalizedHydratedRecipes.map((recipe) => String(recipe.id || '').trim()).filter(Boolean));
  const requiredIds = extractRecipeIdsFromMealPlan(mealPlan);
  if (requiredIds.some((id) => !hydratedById.has(id))) {
    return null;
  }

  return {
    mealPlan,
    recipes: normalizedHydratedRecipes,
    onboardingAnswers: onboardingAnswers || undefined,
  };
}

function collectRecipeIdsFromCacheEntries(entries, limit = 180) {
  const max = Math.max(1, Math.min(1200, Number(limit || 180)));
  const output = [];
  const seen = new Set();
  for (const entry of Array.isArray(entries) ? entries : []) {
    const bundle = entry?.bundle && typeof entry.bundle === 'object' && !Array.isArray(entry.bundle) ? entry.bundle : null;
    const candidateIds = normalizeRecipeIdList([
      ...normalizeRecipeIdList(bundle?.recipeIds ?? bundle?.recipe_ids, max),
      ...extractRecipeIdsFromMealPlan(bundle?.mealPlan),
    ], max);
    for (const recipeId of candidateIds) {
      if (!recipeId || seen.has(recipeId)) continue;
      seen.add(recipeId);
      output.push(recipeId);
      if (output.length >= max) return output;
    }
  }
  return output;
}

async function loadPatientGeneratedRecipeCatalog({
  patientEmail,
  cacheLimit = 36,
  includeGlobalGeneratedFallback = true,
  targetLimit = 60,
}) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) {
    return {
      recipes: [],
      cacheEntryCount: 0,
      hydratedEntryCount: 0,
    };
  }

  const boundedTargetLimit = Math.max(24, Math.min(240, Number(targetLimit || 60)));
  const maxRecipeIds = Math.max(72, Math.min(240, boundedTargetLimit * 3));
  const cacheEntries = await listMealPlanGenerationCacheByPatientEmail(normalizedEmail, cacheLimit).catch((errorObject) => {
    error('meal_plan.generated_catalog_cache_list_failed', {
      email: normalizedEmail,
      message: errorObject?.message || String(errorObject),
    });
    return [];
  });

  const cacheRecipeIds = collectRecipeIdsFromCacheEntries(cacheEntries, maxRecipeIds);
  const persistedByCacheIds = cacheRecipeIds.length > 0
    ? await listMealPlannerRecipesByIds(cacheRecipeIds).catch((errorObject) => {
        error('meal_plan.generated_catalog_recipe_lookup_failed', {
          email: normalizedEmail,
          message: errorObject?.message || String(errorObject),
        });
        return [];
      })
    : [];
  const persistedRecipes = normalizeRecipeListForProduct(persistedByCacheIds).filter((recipe) =>
    isLikelyGeneratedRecipe(recipe)
  );
  const persistedById = new Map(persistedRecipes.map((recipe) => [recipe.id, recipe]));
  const missingLegacyById = new Map();

  for (const entry of Array.isArray(cacheEntries) ? cacheEntries : []) {
    const bundle = entry?.bundle && typeof entry.bundle === 'object' && !Array.isArray(entry.bundle) ? entry.bundle : null;
    if (!bundle) continue;
    const legacyRecipes = normalizeRecipeListForProduct(Array.isArray(bundle.recipes) ? bundle.recipes : []).filter(
      (recipe) => isLikelyGeneratedRecipe(recipe)
    );
    for (const recipe of legacyRecipes) {
      if (persistedById.has(recipe.id) || missingLegacyById.has(recipe.id)) continue;
      missingLegacyById.set(recipe.id, recipe);
      if (missingLegacyById.size >= maxRecipeIds) break;
    }
    if (missingLegacyById.size >= maxRecipeIds) break;
  }

  if (missingLegacyById.size > 0) {
    const missingLegacyRecipes = [...missingLegacyById.values()];
    void upsertMealPlannerRecipes(missingLegacyRecipes).catch((errorObject) => {
      error('meal_plan.generated_catalog_legacy_backfill_failed', {
        email: normalizedEmail,
        message: errorObject?.message || String(errorObject),
      });
    });
    for (const recipe of missingLegacyRecipes) {
      persistedById.set(recipe.id, recipe);
    }
  }

  const merged = new Map();
  let hydratedRecipeCount = 0;

  for (const entry of Array.isArray(cacheEntries) ? cacheEntries : []) {
    const bundle = entry?.bundle && typeof entry.bundle === 'object' && !Array.isArray(entry.bundle) ? entry.bundle : null;
    if (!bundle) continue;
    const candidateIds = normalizeRecipeIdList([
      ...normalizeRecipeIdList(bundle.recipeIds ?? bundle.recipe_ids, 1200),
      ...extractRecipeIdsFromMealPlan(bundle.mealPlan),
    ], 1200);
    if (candidateIds.length === 0) continue;

    const legacyRecipes = normalizeRecipeListForProduct(Array.isArray(bundle.recipes) ? bundle.recipes : []).filter(
      (recipe) => isLikelyGeneratedRecipe(recipe)
    );
    const legacyById = new Map(legacyRecipes.map((recipe) => [recipe.id, recipe]));
    for (const recipeId of candidateIds) {
      const recipe = persistedById.get(recipeId) || legacyById.get(recipeId);
      if (!recipe || !isLikelyGeneratedRecipe(recipe) || merged.has(recipe.id)) continue;
      merged.set(recipe.id, recipe);
      hydratedRecipeCount += 1;
      if (merged.size >= boundedTargetLimit) break;
    }
    if (merged.size >= boundedTargetLimit) break;
  }

  if (merged.size < boundedTargetLimit) {
    for (const recipe of persistedRecipes) {
      if (!merged.has(recipe.id)) merged.set(recipe.id, recipe);
      if (merged.size >= boundedTargetLimit) break;
    }
  }

  if (includeGlobalGeneratedFallback && merged.size < boundedTargetLimit) {
    const allPersistedRecipes = await listMealPlannerRecipes().catch((errorObject) => {
      error('meal_plan.generated_catalog_global_lookup_failed', {
        email: normalizedEmail,
        message: errorObject?.message || String(errorObject),
      });
      return [];
    });
    const generatedFallbackRecipes = normalizeRecipeListForProduct(
      (Array.isArray(allPersistedRecipes) ? allPersistedRecipes : []).filter((recipe) => isLikelyGeneratedRecipe(recipe))
    );
    for (const recipe of generatedFallbackRecipes) {
      if (!merged.has(recipe.id)) merged.set(recipe.id, recipe);
      if (merged.size >= boundedTargetLimit) break;
    }
  }

  return {
    recipes: [...merged.values()],
    cacheEntryCount: Array.isArray(cacheEntries) ? cacheEntries.length : 0,
    hydratedEntryCount: hydratedRecipeCount,
  };
}

function isRulesFallbackCacheEntry(entry) {
  const source = String(entry?.source || '').trim().toLowerCase();
  const stage = String(entry?.stage || '').trim().toLowerCase();
  return source === 'rules' || stage.startsWith('rules_');
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

function issuePatientMagicLinkToken(email) {
  const payload = {
    email: normalizeEmail(email),
    scope: 'patient_magic_link',
    exp: Date.now() + PATIENT_MAGIC_LINK_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signResetTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyPatientMagicLinkToken(token) {
  const normalizedToken = normalizeResetToken(token);
  if (!normalizedToken || !normalizedToken.includes('.')) return null;
  const [encodedPayload, incomingSignature] = normalizedToken.split('.');
  const expectedSignature = signResetTokenPayload(encodedPayload);
  if (!safeTimingCompare(incomingSignature, expectedSignature)) return null;

  let payload = null;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.scope !== 'patient_magic_link') return null;
  if (!payload.exp || Number(payload.exp) < Date.now()) return null;
  const email = normalizeEmail(payload.email);
  if (!isLikelyPatientEmail(email)) return null;
  return { email };
}

function buildPatientMagicLinkUrl(req, token, email = '') {
  const baseUrl = getFrontendBaseUrl(req);
  const loginUrl = new URL('/patient-login', baseUrl || getAppBaseUrl(req));
  loginUrl.searchParams.set('magic_token', String(token || '').trim());
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail) loginUrl.searchParams.set('email', normalizedEmail);
  return loginUrl.toString();
}

function issuePatientEmailChangeToken({ currentEmail, nextEmail }) {
  const payload = {
    scope: 'patient_email_change',
    currentEmail: normalizeEmail(currentEmail),
    nextEmail: normalizeEmail(nextEmail),
    exp: Date.now() + PATIENT_EMAIL_CHANGE_TTL_MS,
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = signResetTokenPayload(encodedPayload);
  return `${encodedPayload}.${signature}`;
}

function verifyPatientEmailChangeToken(token) {
  const normalizedToken = normalizeResetToken(token);
  if (!normalizedToken || !normalizedToken.includes('.')) return null;
  const [encodedPayload, incomingSignature] = normalizedToken.split('.');
  const expectedSignature = signResetTokenPayload(encodedPayload);
  if (!safeTimingCompare(incomingSignature, expectedSignature)) return null;

  let payload = null;
  try {
    payload = JSON.parse(decodeBase64Url(encodedPayload));
  } catch {
    payload = null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (payload.scope !== 'patient_email_change') return null;
  if (!payload.exp || Number(payload.exp) < Date.now()) return null;
  const currentEmail = normalizeEmail(payload.currentEmail);
  const nextEmail = normalizeEmail(payload.nextEmail);
  if (!isLikelyPatientEmail(currentEmail) || !isLikelyPatientEmail(nextEmail)) return null;
  if (currentEmail === nextEmail) return null;
  return { currentEmail, nextEmail };
}

function buildPatientEmailChangeConfirmUrl(req, token) {
  const baseUrl = getFrontendBaseUrl(req);
  const portalUrl = new URL('/patient', baseUrl || getAppBaseUrl(req));
  portalUrl.searchParams.set('email_change_token', String(token || '').trim());
  return portalUrl.toString();
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
    id: String(user?.id || '').trim(),
    email: normalizeEmail(user?.email || fallbackEmail),
    fullName: String(metadata?.full_name || '').trim(),
    dob: String(metadata?.dob || '').trim(),
    phone: String(metadata?.phone || '').trim(),
    address: String(metadata?.address || '').trim(),
    profilePhotoPath: normalizeStoragePath(metadata?.profile_photo_path || ''),
    source: 'supabase',
    createdAt: String(user?.created_at || ''),
    updatedAt: String(user?.updated_at || ''),
    lastLoginAt: '',
    lastPasswordResetAt: '',
    hasPassword: true,
  };
}

async function upsertSupabasePatientProfileRows({
  userId,
  email = '',
  fullName = '',
  dob = '',
  phone = '',
  address = '',
  profilePhotoPath = '',
}) {
  const config = getSupabaseConfig();
  if (!config.enabled || !userId) return;

  const normalizedEmail = normalizeEmail(email);
  const resolvedFullName = String(fullName || '').trim();
  const nameParts = splitFullName(resolvedFullName);
  const resolvedDob = String(dob || '').trim();
  const resolvedPhone = String(phone || '').trim();
  const resolvedAddress = String(address || '').trim();
  const resolvedPhotoPath = normalizeStoragePath(profilePhotoPath);

  await supabaseRestRequest(config, 'profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: userId,
      role: 'patient',
      first_name: nameParts.firstName || null,
      last_name: nameParts.lastName || null,
      phone: resolvedPhone || null,
      dob: resolvedDob || null,
      updated_at: new Date().toISOString(),
    },
  });

  const patientBody = {
    id: userId,
    owner_id: userId,
    email: normalizedEmail || null,
    full_name: resolvedFullName || null,
    phone: resolvedPhone || null,
    address: resolvedAddress || null,
    profile_photo_path: resolvedPhotoPath || null,
  };

  await supabaseRestRequest(config, 'patients', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: patientBody,
  });
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
  const fullName = String(account?.fullName || draft.fullName || '').trim();
  const [firstName, ...restNames] = fullName.split(/\s+/).filter(Boolean);
  return {
    fullName,
    firstName: firstName || '',
    lastName: restNames.join(' '),
    email: normalizeEmail(email || account?.email || draft.email || ''),
    dob: String(account?.dob || draft.dob || '').trim(),
    phone: String(account?.phone || draft.phone || '').trim(),
    address: String(account?.address || draft.address || '').trim(),
    profilePhotoPath: normalizeStoragePath(account?.profilePhotoPath || ''),
    profilePhotoUrl: buildPublicStorageUrl(normalizeStoragePath(account?.profilePhotoPath || ''), PROFILE_IMAGE_BUCKET),
  };
}

function splitFullName(value) {
  const tokens = String(value || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return { firstName: '', lastName: '' };
  return {
    firstName: tokens[0],
    lastName: tokens.slice(1).join(' '),
  };
}

function joinName(firstName, lastName) {
  return [String(firstName || '').trim(), String(lastName || '').trim()].filter(Boolean).join(' ').trim();
}

function normalizeStoragePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.replace(/^\/+/, '');
}

function buildPublicStorageUrl(path, bucket = WEIGHT_LOSS_IMAGE_BUCKET) {
  const normalizedPath = normalizeStoragePath(path);
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const config = getSupabaseConfig();
  if (!config.url) return '';
  const encodedPath = normalizedPath.split('/').map((part) => encodeURIComponent(part)).join('/');
  const encodedBucket = encodeURIComponent(String(bucket || WEIGHT_LOSS_IMAGE_BUCKET).trim());
  return `${config.url}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

async function uploadBufferToSupabaseStorage({
  config,
  bucket,
  objectPath,
  contentType,
  bodyBuffer,
}) {
  const response = await fetch(
    `${config.url}/storage/v1/object/${encodeURIComponent(String(bucket || '').trim())}/${objectPath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
    {
      method: 'POST',
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        'Content-Type': contentType || 'application/octet-stream',
        'x-upsert': 'true',
      },
      body: bodyBuffer,
    }
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Storage upload failed (${response.status}) ${text || ''}`.trim());
  }
}

async function uploadPatientProfilePhotoDataUrl({ email, dataUrl, userId = '' }) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    throw new Error('Profile photo upload requires Supabase storage');
  }

  const parsed = parseSupportedRecipeDataImageUri(dataUrl);
  if (!parsed) {
    throw new Error('Unsupported profile photo format');
  }

  const buffer = Buffer.from(parsed.body, 'base64');
  if (!buffer.length) {
    throw new Error('Profile photo payload was empty');
  }
  if (buffer.length > 8 * 1024 * 1024) {
    throw new Error('Profile photo is too large. Max 8MB.');
  }

  const normalizedEmail = normalizeEmail(email);
  const fallbackSubject = normalizedEmail || String(userId || '').trim() || 'patient';
  const safeSubject = fallbackSubject.replace(/[^a-z0-9._-]/gi, '_').slice(0, 96) || 'patient';
  const extensionByMime = {
    'image/webp': 'webp',
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/gif': 'gif',
    'image/avif': 'avif',
  };
  const extension = extensionByMime[parsed.mime] || 'webp';
  const objectPath = `patients/${safeSubject}/profile-${Date.now()}.${extension}`;

  await uploadBufferToSupabaseStorage({
    config,
    bucket: PROFILE_IMAGE_BUCKET,
    objectPath,
    contentType: parsed.mime || 'application/octet-stream',
    bodyBuffer: buffer,
  });

  return {
    profilePhotoPath: objectPath,
    profilePhotoUrl: buildPublicStorageUrl(objectPath, PROFILE_IMAGE_BUCKET),
  };
}

function normalizeDietitianProfile(row) {
  if (!row || typeof row !== 'object') return null;
  const fullName = String(row.full_name || '').trim();
  if (!fullName) return null;
  const profilePhotoPath = normalizeStoragePath(row.profile_photo_path);
  return {
    id: String(row.id || '').trim(),
    fullName,
    phone: String(row.phone || '').trim(),
    credentials: String(row.credentials || '').trim(),
    bio: String(row.bio || '').trim(),
    profilePhotoPath,
    profilePhotoUrl: buildPublicStorageUrl(profilePhotoPath),
  };
}

function buildDietitianFallback() {
  const fallbackPath = `dietitians/felicity-profile.webp`;
  return {
    id: DEFAULT_DIETITIAN_ID,
    fullName: DEFAULT_DIETITIAN_NAME,
    phone: '',
    credentials: 'Accredited Dietitian',
    bio: 'Practical, kind, realistic support.',
    profilePhotoPath: fallbackPath,
    profilePhotoUrl: buildPublicStorageUrl(fallbackPath),
  };
}

function getCachedPatientProfile(email) {
  const key = normalizeEmail(email);
  if (!key) return null;
  const cached = patientProfileCache.get(key);
  if (!cached) return null;
  if (cached.expiresAt <= Date.now()) {
    patientProfileCache.delete(key);
    return null;
  }
  return cached.value || null;
}

function setCachedPatientProfile(email, value) {
  const key = normalizeEmail(email);
  if (!key || !value) return;
  patientProfileCache.set(key, {
    expiresAt: Date.now() + PATIENT_PROFILE_CACHE_TTL_MS,
    value,
  });
}

async function resolvePatientProfileByEmail({ email, latestCertificate, account }) {
  const fallbackPatient = buildPatientIdentity({ email, latestCertificate, account });
  const resolvedEmail = normalizeEmail(email || fallbackPatient.email || '');
  const config = getSupabaseConfig();
  if (!config.enabled || !resolvedEmail) {
    return {
      patient: fallbackPatient,
      dietitian: buildDietitianFallback(),
    };
  }

  const cachedProfile = getCachedPatientProfile(resolvedEmail);
  if (cachedProfile) {
    return {
      patient: {
        ...fallbackPatient,
        ...(cachedProfile.patient || {}),
        email: resolvedEmail,
      },
      dietitian: cachedProfile.dietitian || buildDietitianFallback(),
    };
  }

  try {
    const [patientRows, defaultDietitianRows] = await Promise.all([
      supabaseRestRequest(
        config,
        `patients?email=eq.${encodeURIComponent(resolvedEmail)}&select=id,full_name,phone,address,profile_photo_path&limit=1`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      ),
      supabaseRestRequest(
        config,
        `dietitians?is_active=eq.true&select=id,full_name,phone,credentials,bio,profile_photo_path&order=created_at.asc&limit=1`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      ),
    ]);

    const patientRow = patientRows?.[0] || null;
    const fallbackDietitian = normalizeDietitianProfile(defaultDietitianRows?.[0] || null) || buildDietitianFallback();
    if (!patientRow?.id) {
      const fallbackResult = {
        patient: fallbackPatient,
        dietitian: fallbackDietitian,
      };
      setCachedPatientProfile(resolvedEmail, fallbackResult);
      return fallbackResult;
    }

    const accountFullName = String(account?.fullName || '').trim();
    const accountDob = String(account?.dob || '').trim();
    const accountPhone = String(account?.phone || '').trim();
    const accountAddress = String(account?.address || '').trim();
    const accountPhotoPath = normalizeStoragePath(account?.profilePhotoPath || '');
    const patientFullName = String(patientRow.full_name || accountFullName || fallbackPatient.fullName).trim();
    const patientNameParts = splitFullName(patientFullName);
    const patientPhone = String(patientRow.phone || accountPhone || fallbackPatient.phone).trim();
    const patientDob = String(accountDob || fallbackPatient.dob).trim();
    const patientAddress = String(patientRow.address || accountAddress || fallbackPatient.address || '').trim();
    const patientPhotoPath = normalizeStoragePath(patientRow.profile_photo_path || accountPhotoPath);

    const result = {
      patient: {
        fullName: patientFullName,
        firstName: patientNameParts.firstName,
        lastName: patientNameParts.lastName,
        email: resolvedEmail,
        dob: patientDob,
        phone: patientPhone,
        address: patientAddress,
        profilePhotoPath: patientPhotoPath,
        profilePhotoUrl: buildPublicStorageUrl(patientPhotoPath, PROFILE_IMAGE_BUCKET),
      },
      dietitian: fallbackDietitian,
    };
    setCachedPatientProfile(resolvedEmail, result);
    return result;
  } catch (errorObject) {
    error('patient.profile.resolve_failed', {
      email: resolvedEmail,
      message: errorObject?.message || String(errorObject),
    });
    return {
      patient: fallbackPatient,
      dietitian: buildDietitianFallback(),
    };
  }
}

function patientProfileFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  return {
    fullName: String(draft.fullName || '').trim(),
    dob: String(draft.dob || '').trim(),
    phone: String(draft.phone || '').trim(),
    address: String(draft.address || '').trim(),
  };
}

function hasPatientIdentityData(account) {
  return Boolean(
    String(account?.fullName || '').trim() ||
      String(account?.dob || '').trim() ||
      String(account?.phone || '').trim() ||
      String(account?.address || '').trim()
  );
}

function getLatestFromPatientCertificates(patientCertificates) {
  const list = Array.isArray(patientCertificates) ? patientCertificates : [];
  const latest = list[0] || null;
  return {
    patientCertificates: list,
    latest,
    latestProfile: patientProfileFromCertificate(latest),
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
    providerNumber: supabaseDoctor.providerNumber || '',
    approvalStatus: supabaseDoctor.approvalStatus || 'pending',
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

async function loadPatientPortalSnapshot(email, { includeBilling = true } = {}) {
  const normalizedEmail = normalizeEmail(email);
  const shouldUseLeanCertificateQuery = isSupabaseStorageEnabled();
  const certificatesFetchStartedAt = Date.now();
  let account = null;
  let certificates = [];
  let billing = null;
  let billingFetchDurationMs = 0;

  if (shouldUseLeanCertificateQuery) {
    const billingStartedAt = Date.now();
    const [certificateRows, billingProfile] = await Promise.all([
      listCertificatesByPatientEmail(normalizedEmail, {
        includeRawSubmission: false,
        limit: 60,
      }),
      includeBilling ? resolvePatientBillingProfile(normalizedEmail, null) : Promise.resolve(null),
    ]);
    certificates = certificateRows;
    billing = billingProfile;
    billingFetchDurationMs = includeBilling ? Date.now() - billingStartedAt : 0;
  } else {
    const [localAccount, certificateRows] = await Promise.all([
      getPatientAccountByEmail(normalizedEmail),
      listCertificatesByPatientEmail(normalizedEmail, {
        includeRawSubmission: true,
        limit: 500,
      }),
    ]);
    account = localAccount;
    certificates = certificateRows;
  }

  const certificatesFetchDurationMs = Date.now() - certificatesFetchStartedAt;
  const { patientCertificates, latest } = getLatestFromPatientCertificates(certificates);
  const queueCount = patientCertificates.filter((item) => isCertificateOpenForReview(item)).length;
  if (!shouldUseLeanCertificateQuery) {
    const billingStartedAt = Date.now();
    billing = includeBilling ? await resolvePatientBillingProfile(normalizedEmail, certificates) : null;
    billingFetchDurationMs = includeBilling ? Date.now() - billingStartedAt : 0;
  }

  return {
    account,
    patientCertificates,
    latest,
    queueCount,
    billing,
    requests: patientCertificates.map(patientSummaryFromCertificate),
    certificatesFetchDurationMs,
    billingFetchDurationMs,
  };
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

async function updateStripeCustomerEmail(customerId, nextEmail) {
  const normalizedCustomerId = String(customerId || '').trim();
  const normalizedEmail = normalizeEmail(nextEmail);
  if (!normalizedCustomerId || !normalizedEmail || !STRIPE_SECRET_KEY) return null;

  const params = new URLSearchParams();
  params.set('email', normalizedEmail);

  const response = await fetch(`https://api.stripe.com/v1/customers/${encodeURIComponent(normalizedCustomerId)}`, {
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
    const message = payload?.error?.message || `Unable to update Stripe customer email (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  return payload;
}

async function updateStripeSubscriptionPatientEmail(subscriptionId, nextEmail) {
  const normalizedSubscriptionId = String(subscriptionId || '').trim();
  const normalizedEmail = normalizeEmail(nextEmail);
  if (!normalizedSubscriptionId || !normalizedEmail || !STRIPE_SECRET_KEY) return null;

  const params = new URLSearchParams();
  params.set('metadata[patient_email]', normalizedEmail);

  const response = await fetch(`https://api.stripe.com/v1/subscriptions/${encodeURIComponent(normalizedSubscriptionId)}`, {
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
    const message = payload?.error?.message || `Unable to update Stripe subscription metadata (${response.status})`;
    const err = new Error(message);
    err.status = response.status;
    err.data = payload;
    throw err;
  }

  stripeSubscriptionCache.delete(normalizedSubscriptionId);
  return payload;
}

async function migratePatientBillingForEmailChange({ currentEmail, nextEmail }) {
  const previousEmail = normalizeEmail(currentEmail);
  const targetEmail = normalizeEmail(nextEmail);
  if (!previousEmail || !targetEmail || previousEmail === targetEmail) return null;

  const existingBilling = await getPatientBillingByEmail(previousEmail).catch(() => null);
  if (!existingBilling) return null;

  const stripeCustomerId = String(existingBilling.stripeCustomerId || '').trim();
  const stripeSubscriptionId = String(existingBilling.stripeSubscriptionId || '').trim();
  const billingPatch = {
    ...existingBilling,
    patientEmail: targetEmail,
    source: 'patient.email_change',
  };

  let savedBilling = null;
  try {
    savedBilling = await upsertPatientBillingByEmail(targetEmail, billingPatch);
  } catch (errorObject) {
    error('patient.billing.email_migration_failed', {
      currentEmail: previousEmail,
      nextEmail: targetEmail,
      message: errorObject?.message || String(errorObject),
    });
  }

  if (stripeCustomerId || stripeSubscriptionId) {
    if (stripeCustomerId) {
      try {
        await updateStripeCustomerEmail(stripeCustomerId, targetEmail);
      } catch (errorObject) {
        error('patient.billing.stripe_customer_email_update_failed', {
          currentEmail: previousEmail,
          nextEmail: targetEmail,
          stripeCustomerId,
          message: errorObject?.message || String(errorObject),
        });
      }
    }
    if (stripeSubscriptionId) {
      try {
        const updatedSubscription = await updateStripeSubscriptionPatientEmail(stripeSubscriptionId, targetEmail);
        await syncPatientBillingFromStripeSubscription(updatedSubscription, {
          source: 'patient.email_change',
          fallbackPatientEmail: targetEmail,
        });
      } catch (errorObject) {
        error('patient.billing.stripe_subscription_email_update_failed', {
          currentEmail: previousEmail,
          nextEmail: targetEmail,
          stripeSubscriptionId,
          message: errorObject?.message || String(errorObject),
        });
      }
    }
  }

  return normalizeBillingProfile(savedBilling || billingPatch, targetEmail);
}

async function migratePatientCertificateEmailReferences({ currentEmail, nextEmail }) {
  const previousEmail = normalizeEmail(currentEmail);
  const targetEmail = normalizeEmail(nextEmail);
  if (!previousEmail || !targetEmail || previousEmail === targetEmail) return 0;

  const certificates = await listCertificatesByPatientEmail(previousEmail).catch(() => []);
  let migratedCount = 0;
  for (const certificate of certificates) {
    const certificateId = String(certificate?.id || '').trim();
    if (!certificateId) continue;
    const migrated = await updateCertificate(certificateId, (current) => {
      const draft = current?.certificateDraft && typeof current.certificateDraft === 'object' ? current.certificateDraft : {};
      const rawSubmission =
        current?.rawSubmission && typeof current.rawSubmission === 'object' && !Array.isArray(current.rawSubmission)
          ? { ...current.rawSubmission }
          : {};
      const existingPatientPayload =
        rawSubmission.patient && typeof rawSubmission.patient === 'object' && !Array.isArray(rawSubmission.patient)
          ? { ...rawSubmission.patient }
          : {};
      const existingConsultPayload =
        rawSubmission.consult && typeof rawSubmission.consult === 'object' && !Array.isArray(rawSubmission.consult)
          ? { ...rawSubmission.consult }
          : {};
      const nextRawSubmission = {
        ...rawSubmission,
        patientEmail: targetEmail,
        email: targetEmail,
        patient: {
          ...existingPatientPayload,
          email: targetEmail,
        },
        consult: {
          ...existingConsultPayload,
          email: targetEmail,
        },
      };
      return {
        ...current,
        certificateDraft: {
          ...draft,
          email: targetEmail,
        },
        rawSubmission: nextRawSubmission,
      };
    });
    if (migrated) migratedCount += 1;
  }

  const config = getSupabaseConfig();
  if (config.enabled) {
    try {
      await supabaseRestRequest(
        config,
        `medical_certificate_requests?patient_email=eq.${encodeURIComponent(previousEmail)}`,
        {
          method: 'PATCH',
          body: {
            patient_email: targetEmail,
          },
        }
      );
    } catch (errorObject) {
      error('patient.email_change.medical_requests_email_patch_failed', {
        currentEmail: previousEmail,
        nextEmail: targetEmail,
        message: errorObject?.message || String(errorObject),
      });
    }
  }

  return migratedCount;
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

async function patientAccountExistsFast(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return false;

  const supabaseConfig = getSupabaseConfig();
  if (supabaseConfig.enabled) {
    const rows = await supabaseRestRequest(
      supabaseConfig,
      `patients?email=eq.${encodeURIComponent(normalized)}&select=id,email&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    if (Array.isArray(rows) && rows.length > 0) return true;
  }

  const localAccount = await getPatientAccountByEmail(normalized);
  return Boolean(localAccount);
}

async function patientAccountExistsByEmailOrPhone({ email = '', phone = '' }) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPhone = normalizePhoneForLookup(phone);

  if (normalizedEmail && (await patientAccountExistsFast(normalizedEmail))) {
    return { exists: true, reason: 'email', email: normalizedEmail };
  }

  if (!normalizedPhone) {
    return { exists: false, reason: 'none', email: normalizedEmail };
  }

  const supabaseConfig = getSupabaseConfig();
  if (supabaseConfig.enabled) {
    try {
      const phoneCandidates = [normalizedPhone];
      if (normalizedPhone.startsWith('+')) {
        phoneCandidates.push(normalizedPhone.slice(1));
      } else {
        phoneCandidates.push(`+${normalizedPhone}`);
      }

      for (const candidate of [...new Set(phoneCandidates.filter(Boolean))]) {
        const patientRows = await supabaseRestRequest(
          supabaseConfig,
          `patients?phone=eq.${encodeURIComponent(candidate)}&select=email&limit=1`,
          { method: 'GET', prefer: 'return=representation' }
        );
        const matchedEmail = normalizeEmail(patientRows?.[0]?.email || '');
        if (matchedEmail) {
          return { exists: true, reason: 'phone', email: matchedEmail };
        }
      }
    } catch (errorObject) {
      error('patient.account_exists.phone_lookup_failed', {
        email: normalizedEmail,
        message: errorObject?.message || String(errorObject),
      });
    }
  }

  return { exists: false, reason: 'none', email: normalizedEmail };
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
    const shouldSendDoctorReviewEmail = String(trigger || '') === 'stripe_webhook' || !STRIPE_WEBHOOK_SECRET;
    if (shouldSendDoctorReviewEmail) {
      await sendDoctorReviewEmail(updated, req);
    } else {
      info('stripe.payment.review_email_skipped_non_webhook', {
        certificateId: updated.id,
        stripeSessionId: session.id || null,
        trigger,
      });
    }
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

async function reconcilePendingPaymentCertificatesForPatient(patientEmail, req) {
  const email = normalizeEmail(patientEmail);
  if (!email) return { checked: 0, reconciled: 0 };

  const certificates = await listCertificatesByPatientEmail(email).catch(() => []);
  const candidates = certificates
    .filter((certificate) => {
      const status = String(certificate?.status || '').trim().toLowerCase();
      const sessionId = String(certificate?.rawSubmission?.payment?.stripeSessionId || '').trim();
      return isOpenForReview(status) && isStripePaymentPendingForCertificate(certificate) && Boolean(sessionId);
    })
    .slice(0, 5);

  let reconciled = 0;
  for (const certificate of candidates) {
    try {
      const sessionId = String(certificate?.rawSubmission?.payment?.stripeSessionId || '').trim();
      if (!sessionId) continue;
      const session = await fetchStripeCheckoutSession(sessionId);
      const paymentStatus = String(session?.payment_status || '').trim().toLowerCase();
      if (!['paid', 'no_payment_required'].includes(paymentStatus)) continue;
      const result = await markPaidFromStripeSession(session, 'patient_status_reconcile', req);
      if (result?.updated) reconciled += 1;
    } catch (errorObject) {
      error('patient.payment_pending_reconcile_failed', {
        email,
        certificateId: certificate?.id || null,
        message: errorObject?.message || String(errorObject),
      });
    }
  }

  return {
    checked: candidates.length,
    reconciled,
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

async function registerDoctorAccount({
  email,
  password,
  fullName,
  providerType,
  registrationNumber,
  providerNumber = '',
  approvalStatus = 'pending',
}) {
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
          provider_number: normalizeProviderNumber(providerNumber),
          approval_status: normalizeApprovalStatus(approvalStatus),
          provider_approved: normalizeApprovalStatus(approvalStatus) === 'approved',
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
    providerNumber: normalizeProviderNumber(loginData?.user?.user_metadata?.provider_number),
    approvalStatus:
      loginData?.user?.user_metadata?.provider_approved === true
        ? 'approved'
        : normalizeApprovalStatus(loginData?.user?.user_metadata?.approval_status),
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
    providerNumber: normalizeProviderNumber(match?.user_metadata?.provider_number),
    approvalStatus:
      match?.user_metadata?.provider_approved === true
        ? 'approved'
        : normalizeApprovalStatus(match?.user_metadata?.approval_status),
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

async function upsertSupabaseDoctorMetadata({
  email,
  fullName = '',
  providerType = '',
  registrationNumber = '',
  providerNumber = '',
  approvalStatus = '',
}) {
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
    provider_number: normalizeProviderNumber(providerNumber || currentMetadata?.provider_number || ''),
    approval_status: approvalStatus
      ? normalizeApprovalStatus(approvalStatus)
      : normalizeApprovalStatus(currentMetadata?.approval_status),
    provider_approved: approvalStatus
      ? normalizeApprovalStatus(approvalStatus) === 'approved'
      : currentMetadata?.provider_approved === true,
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
    providerNumber: normalizeProviderNumber(nextMetadata.provider_number),
    approvalStatus: nextMetadata.provider_approved === true ? 'approved' : normalizeApprovalStatus(nextMetadata.approval_status),
  };
}

async function findSupabasePatientUserByEmail(email) {
  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  try {
    const patientRows = await supabaseRestRequest(
      config,
      `patients?email=eq.${encodeURIComponent(normalized)}&select=id&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const patientId = String(patientRows?.[0]?.id || '').trim();
    if (patientId) {
      const user = await getSupabaseAuthUserById(config, patientId);
      if (user && userHasPatientRole(user)) return user;
    }
  } catch {
    // Fall through to the broader lookup.
  }

  const users = await listSupabaseAuthUsers(config);
  return users.find((entry) => normalizeEmail(entry?.email) === normalized && userHasPatientRole(entry)) || null;
}

async function findSupabasePatientByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  const match = await findSupabasePatientUserByEmail(normalizedEmail);
  if (!match) return null;

  const account = {
    id: match.id || null,
    ...toPatientAccountFromSupabaseUser(match, normalizedEmail),
  };
  const config = getSupabaseConfig();
  if (!config.enabled || !account?.id) return account;

  try {
    const rows = await supabaseRestRequest(
      config,
      `patients?id=eq.${encodeURIComponent(account.id)}&select=address,profile_photo_path&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const row = rows?.[0] || null;
    if (!row) return account;
    const profilePhotoPath = normalizeStoragePath(row.profile_photo_path || account.profilePhotoPath || '');
    return {
      ...account,
      address: String(row.address || account.address || '').trim(),
      profilePhotoPath,
    };
  } catch {
    return account;
  }
}

async function createPatientAccountViaSupabase({
  email,
  password,
  fullName = '',
  dob = '',
  phone = '',
  address = '',
  profilePhotoPath = '',
}) {
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
          address: String(address || '').trim(),
          profile_photo_path: normalizeStoragePath(profilePhotoPath),
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
  const account = toPatientAccountFromSupabaseUser(user, email);
  if (account?.id) {
    await upsertSupabasePatientProfileRows({
      userId: account.id,
      email: account.email,
      fullName: String(fullName || account.fullName || '').trim(),
      dob: String(dob || account.dob || '').trim(),
      phone: String(phone || account.phone || '').trim(),
      address: String(address || account.address || '').trim(),
      profilePhotoPath: normalizeStoragePath(profilePhotoPath || account.profilePhotoPath || ''),
    });
  }
  return account;
}

async function authenticatePatientViaSupabase(email, password) {
  const config = getSupabaseConfig();
  if (!config.url || !config.anonKey) {
    return { account: null, shouldFallbackLocal: true };
  }

  let loginResponse;
  try {
    loginResponse = await fetch(`${config.url}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    });
  } catch (errorObject) {
    info('patient.login.supabase_auth_unavailable', {
      email: normalizeEmail(email),
      message: errorObject?.message || String(errorObject),
    });
    return { account: null, shouldFallbackLocal: true };
  }

  const text = await loginResponse.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!loginResponse.ok) {
    const authRejected = loginResponse.status === 400 || loginResponse.status === 401 || loginResponse.status === 422;
    return { account: null, shouldFallbackLocal: !authRejected };
  }
  const user = data?.user || null;
  if (!user || userHasDoctorRole(user)) {
    return { account: null, shouldFallbackLocal: false };
  }

  return {
    account: toPatientAccountFromSupabaseUser(user, email),
    shouldFallbackLocal: false,
  };
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

async function upsertSupabasePatientMetadata({ email, fullName, dob, phone, address = '', profilePhotoPath = '' }) {
  const existing = await findSupabasePatientByEmail(email);
  if (!existing?.id) return null;

  const usersConfig = getSupabaseConfig();
  const user = await getSupabaseAuthUserById(usersConfig, existing.id);
  if (!user) return existing;

  const currentMetadata = user?.user_metadata || {};
  const nextMetadata = {
    ...currentMetadata,
    role: String(currentMetadata?.role || 'patient'),
    full_name: String(fullName || currentMetadata?.full_name || '').trim(),
    dob: String(dob || currentMetadata?.dob || '').trim(),
    phone: String(phone || currentMetadata?.phone || '').trim(),
    address: String(address || currentMetadata?.address || '').trim(),
    profile_photo_path: normalizeStoragePath(profilePhotoPath || currentMetadata?.profile_photo_path || ''),
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

  if (existing?.id) {
    await upsertSupabasePatientProfileRows({
      userId: existing.id,
      email: existing.email,
      fullName: String(nextMetadata.full_name || '').trim(),
      dob: String(nextMetadata.dob || '').trim(),
      phone: String(nextMetadata.phone || '').trim(),
      address: String(nextMetadata.address || '').trim(),
      profilePhotoPath: normalizeStoragePath(nextMetadata.profile_photo_path || ''),
    });
  }

  return {
    ...existing,
    fullName: String(nextMetadata.full_name || '').trim(),
    dob: String(nextMetadata.dob || '').trim(),
    phone: String(nextMetadata.phone || '').trim(),
    address: String(nextMetadata.address || '').trim(),
    profilePhotoPath: normalizeStoragePath(nextMetadata.profile_photo_path || ''),
  };
}

async function updateSupabasePatientEmail({ currentEmail, nextEmail }) {
  const fromEmail = normalizeEmail(currentEmail);
  const toEmail = normalizeEmail(nextEmail);
  if (!fromEmail || !toEmail) return null;
  if (fromEmail === toEmail) return findSupabasePatientByEmail(fromEmail);

  const config = getSupabaseConfig();
  if (!config.enabled) return null;

  const existing = await findSupabasePatientByEmail(fromEmail);
  if (!existing?.id) return null;

  const conflict = await findSupabasePatientByEmail(toEmail);
  if (conflict?.id && conflict.id !== existing.id) {
    const err = new Error('Email is already used by another account');
    err.status = 409;
    throw err;
  }

  const user = await getSupabaseAuthUserById(config, existing.id);
  const metadata = user?.user_metadata && typeof user.user_metadata === 'object'
    ? user.user_metadata
    : {};
  await supabaseAuthAdminRequest(config, `users/${existing.id}`, {
    method: 'PUT',
    body: {
      email: toEmail,
      email_confirm: true,
      user_metadata: metadata,
    },
  });

  await upsertSupabasePatientProfileRows({
    userId: existing.id,
    email: toEmail,
    fullName: String(metadata?.full_name || existing.fullName || '').trim(),
    dob: String(metadata?.dob || existing.dob || '').trim(),
    phone: String(metadata?.phone || existing.phone || '').trim(),
    address: String(metadata?.address || existing.address || '').trim(),
    profilePhotoPath: normalizeStoragePath(metadata?.profile_photo_path || existing.profilePhotoPath || ''),
  });

  return {
    ...existing,
    email: toEmail,
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

    if (req.method === 'POST' && routePath === 'patient/account-exists') {
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
      let accountExists = patientEmail ? await patientAccountExists(patientEmail) : false;
      let magicLinkSent = false;
      const supabaseConfig = getSupabaseConfig();
      if (patientEmail && result?.updated) {
        if (!accountExists) {
          const certificates = await listCertificatesByPatientEmail(patientEmail);
          const { latestProfile } = getLatestFromPatientCertificates(certificates);
          if (supabaseConfig.enabled) {
            try {
              await createPatientAccountViaSupabase({
                email: patientEmail,
                password: createBootstrapPassword(),
                fullName: latestProfile.fullName,
                dob: latestProfile.dob,
                phone: latestProfile.phone,
                address: latestProfile.address,
              });
            } catch (errorObject) {
              if (errorObject?.status !== 409) throw errorObject;
            }
          } else {
            try {
              await createPatientAccount({
                email: patientEmail,
                password: createBootstrapPassword(),
                fullName: latestProfile.fullName,
                dob: latestProfile.dob,
                phone: latestProfile.phone,
                address: latestProfile.address,
              });
            } catch (errorObject) {
              if (errorObject?.code !== 'ACCOUNT_EXISTS') throw errorObject;
            }
          }
          accountExists = await patientAccountExists(patientEmail);
        }

        if (accountExists) {
          try {
            const token = issuePatientMagicLinkToken(patientEmail);
            const magicUrl = buildPatientMagicLinkUrl(req, token, patientEmail);
            const emailContent = renderPatientMagicLinkEmail({
              baseUrl: getFrontendBaseUrl(req),
              magicUrl,
              expiresMinutes: String(Math.round(PATIENT_MAGIC_LINK_TTL_MS / (1000 * 60))),
            });
            await sendEmail({
              to: patientEmail,
              subject: 'Your Onya Health portal sign-in link',
              html: emailContent.html,
              text: emailContent.text,
            });
            magicLinkSent = true;
            await appendAudit({
              type: 'PATIENT_MAGIC_LINK_SENT_AFTER_CHECKOUT',
              email: patientEmail,
              stripeSessionId: sessionId,
            });
          } catch (errorObject) {
            error('checkout.confirm.magic_link_send_failed', {
              patientEmail,
              stripeSessionId: sessionId,
              message: errorObject?.message || String(errorObject),
            });
          }
        }
      }
      sendJson(res, 200, {
        ok: true,
        sessionId,
        paymentStatus: session?.payment_status || null,
        certificateId: result?.certificateId || null,
        status: result?.status || null,
        updated: Boolean(result?.updated),
        patientEmail,
        accountExists,
        requiresAccountSetup: false,
        magicLinkSent,
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

      const certificates = await listCertificatesByPatientEmail(expectedEmail, {
        includeRawSubmission: false,
        limit: 120,
      });
      const { latest, latestProfile } = getLatestFromPatientCertificates(certificates);
      const { fullName, dob, phone, address } = latestProfile;

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
            address,
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
            address,
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
      const profilePayload = await resolvePatientProfileByEmail({
        email: expectedEmail,
        latestCertificate: latest,
        account: account || null,
      });

      sendJson(res, 200, {
        ok: true,
        token: patientToken,
        patientEmail: expectedEmail,
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
      });
      info('patient.checkout_account_setup.completed', {
        email: expectedEmail,
        stripeSessionId: sessionId,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/magic-link/request') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body?.email);
      if (!isLikelyPatientEmail(email)) {
        sendJson(res, 400, { error: 'A valid email is required' });
        return;
      }

      const supabaseConfig = getSupabaseConfig();
      let account = await findSupabasePatientByEmail(email);
      if (!account && supabaseConfig.enabled) {
        const certificates = await listCertificatesByPatientEmail(email, {
          includeRawSubmission: false,
          limit: 120,
        });
        const { latestProfile } = getLatestFromPatientCertificates(certificates);
        if (certificates.length > 0) {
          try {
            account = await createPatientAccountViaSupabase({
              email,
              password: createBootstrapPassword(),
              fullName: latestProfile.fullName,
              dob: latestProfile.dob,
              phone: latestProfile.phone,
              address: latestProfile.address,
            });
          } catch (errorObject) {
            if (errorObject?.status === 409) {
              account = await findSupabasePatientByEmail(email);
            } else {
              throw errorObject;
            }
          }
        }
      }
      if (!account && !supabaseConfig.enabled) {
        account = await getPatientAccountByEmail(email);
      }

      if (account) {
        try {
          const token = issuePatientMagicLinkToken(email);
          const magicUrl = buildPatientMagicLinkUrl(req, token, email);
          const emailContent = renderPatientMagicLinkEmail({
            baseUrl: getFrontendBaseUrl(req),
            magicUrl,
            expiresMinutes: String(Math.round(PATIENT_MAGIC_LINK_TTL_MS / (1000 * 60))),
          });
          await sendEmail({
            to: email,
            subject: 'Your secure sign-in link',
            html: emailContent.html,
            text: emailContent.text,
          });
          await appendAudit({
            type: 'PATIENT_MAGIC_LINK_REQUESTED',
            email,
          });
        } catch (errorObject) {
          error('patient.magic_link.request_failed', {
            email,
            message: errorObject?.message || String(errorObject),
          });
        }
      }

      sendJson(res, 200, {
        ok: true,
        message: 'If an account exists, a magic link has been sent.',
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/magic-link/consume') {
      const body = await parseJsonBody(req);
      const token = normalizeResetToken(body?.token);
      const decoded = verifyPatientMagicLinkToken(token);
      if (!decoded?.email) {
        sendJson(res, 400, { error: 'Invalid or expired magic link' });
        return;
      }

      const email = normalizeEmail(decoded.email);
      const supabaseConfig = getSupabaseConfig();
      const account = supabaseConfig.enabled ? await findSupabasePatientByEmail(email) : await getPatientAccountByEmail(email);
      if (!account) {
        sendJson(res, 404, { error: 'No patient account found for this email yet' });
        return;
      }

      const patientToken = issuePatientToken(email);
      const profilePayload = {
        patient: buildPatientIdentity({
          email,
          latestCertificate: null,
          account: account || null,
        }),
        dietitian: buildDietitianFallback(),
      };

      sendJson(res, 200, {
        ok: true,
        token: patientToken,
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/login') {
      const loginStartedAt = Date.now();
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

      const supabaseConfig = getSupabaseConfig();

      const authStartedAt = Date.now();
      let account = null;
      let localFallbackAttempted = false;
      if (supabaseConfig.url && supabaseConfig.anonKey) {
        const supabaseAuth = await authenticatePatientViaSupabase(email, password);
        account = supabaseAuth.account;
        if (!account && supabaseAuth.shouldFallbackLocal) {
          localFallbackAttempted = true;
          account = await authenticatePatientAccount({ email, password });
        }
      } else {
        localFallbackAttempted = true;
        account = await authenticatePatientAccount({ email, password });
      }

      if (!account) {
        sendJson(res, 401, { error: 'Invalid email or password' });
        return;
      }

      const token = issuePatientToken(email);
      sendJson(res, 200, {
        token,
        patient: {
          fullName: String(account?.fullName || '').trim(),
          firstName: String(account?.fullName || '').trim().split(/\s+/)[0] || '',
          lastName: String(account?.fullName || '').trim().split(/\s+/).slice(1).join(' '),
          email: normalizeEmail(account?.email || email),
          dob: String(account?.dob || '').trim(),
          phone: String(account?.phone || '').trim(),
          address: String(account?.address || '').trim(),
          profilePhotoPath: normalizeStoragePath(account?.profilePhotoPath || ''),
          profilePhotoUrl: buildPublicStorageUrl(normalizeStoragePath(account?.profilePhotoPath || ''), PROFILE_IMAGE_BUCKET),
        },
        dietitian: buildDietitianFallback(),
      });
      info('patient.login.success', {
        email,
        method: 'password',
        authDurationMs: Date.now() - authStartedAt,
        localFallbackAttempted,
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
      const address = String(body.address || '').trim();

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
            address,
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
            address,
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
      const profilePayload = await resolvePatientProfileByEmail({
        email,
        latestCertificate: null,
        account,
      });
      sendJson(res, 201, {
        token,
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
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

      try {
      const supabaseConfig = getSupabaseConfig();
      let canIssueReset = false;
      let resetTokenMode = supabaseConfig.enabled ? 'supabase' : 'local';
      let latest = null;
      let latestProfile = {
        fullName: '',
        dob: '',
        phone: '',
        address: '',
      };
      let latestSnapshotLoaded = false;
      const ensureLatestSnapshot = async () => {
        if (latestSnapshotLoaded) return;
        const certificates = await listCertificatesByPatientEmail(email);
        const snapshot = getLatestFromPatientCertificates(certificates);
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
                address: latestProfile.address,
              });
            } catch (errorObject) {
              // Account may already exist in Supabase auth with different metadata.
              if (errorObject?.status === 409) {
                await upsertSupabasePatientMetadata({
                  email,
                  fullName: latestProfile.fullName,
                  dob: latestProfile.dob,
                  phone: latestProfile.phone,
                  address: latestProfile.address,
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
                address: latestProfile.address,
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
              address: latestProfile.address,
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
          address: '',
        };
        if (!existing) {
          const certificates = await listCertificatesByPatientEmail(email);
          ({ latestProfile } = getLatestFromPatientCertificates(certificates));
          try {
            account = await createPatientAccountViaSupabase({
              email,
              password: nextPassword,
              fullName: latestProfile.fullName,
              dob: latestProfile.dob,
              phone: latestProfile.phone,
              address: latestProfile.address,
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
        const profilePayload = await resolvePatientProfileByEmail({
          email,
          latestCertificate: null,
          account,
        });
        sendJson(res, 200, {
          token: patientToken,
          patient: profilePayload.patient,
          dietitian: profilePayload.dietitian,
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
      const profilePayload = await resolvePatientProfileByEmail({
        email,
        latestCertificate: null,
        account,
      });
      sendJson(res, 200, {
        token: patientToken,
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
      });
      info('patient.password_reset.completed', { email });
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/bootstrap') {
      const patientBootstrapStartedAt = Date.now();
      const patient = await requirePatient(req, res);
      if (!patient) return;

      void reconcilePendingPaymentCertificatesForPatient(patient.email, req).catch((errorObject) => {
        error('patient.bootstrap.payment_reconcile_failed', {
          email: patient.email,
          message: errorObject?.message || String(errorObject),
        });
      });
      const snapshot = await loadPatientPortalSnapshot(patient.email, { includeBilling: true });
      if (snapshot.patientCertificates.length === 0 && !snapshot.account) {
        sendJson(res, 404, { error: 'Patient not found' });
        return;
      }

      const profileResolveStartedAt = Date.now();
      const profilePayload = await resolvePatientProfileByEmail({
        email: patient.email,
        latestCertificate: snapshot.latest,
        account: snapshot.account,
      });
      const profileResolveDurationMs = Date.now() - profileResolveStartedAt;

      sendJson(res, 200, {
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
        billing: snapshot.billing,
        queueCount: snapshot.queueCount,
        latestRequest: snapshot.latest ? patientSummaryFromCertificate(snapshot.latest) : null,
        count: snapshot.patientCertificates.length,
        requests: snapshot.requests,
      });
      info('patient.bootstrap.loaded', {
        email: patient.email,
        requestCount: snapshot.patientCertificates.length,
        queueCount: snapshot.queueCount,
        certificatesFetchDurationMs: snapshot.certificatesFetchDurationMs,
        billingFetchDurationMs: snapshot.billingFetchDurationMs,
        profileResolveDurationMs,
        totalDurationMs: Date.now() - patientBootstrapStartedAt,
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/me') {
      const patientMeStartedAt = Date.now();
      const patient = await requirePatient(req, res);
      if (!patient) return;

      void reconcilePendingPaymentCertificatesForPatient(patient.email, req).catch((errorObject) => {
        error('patient.me.payment_reconcile_failed', {
          email: patient.email,
          message: errorObject?.message || String(errorObject),
        });
      });
      const snapshot = await loadPatientPortalSnapshot(patient.email, { includeBilling: true });
      if (snapshot.patientCertificates.length === 0 && !snapshot.account) {
        sendJson(res, 404, { error: 'Patient not found' });
        return;
      }

      const profileResolveStartedAt = Date.now();
      const profilePayload = await resolvePatientProfileByEmail({
        email: patient.email,
        latestCertificate: snapshot.latest,
        account: snapshot.account,
      });
      const profileResolveDurationMs = Date.now() - profileResolveStartedAt;

      sendJson(res, 200, {
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
        billing: snapshot.billing,
        queueCount: snapshot.queueCount,
        latestRequest: snapshot.latest ? patientSummaryFromCertificate(snapshot.latest) : null,
      });
      info('patient.me.loaded', {
        email: patient.email,
        requestCount: snapshot.patientCertificates.length,
        queueCount: snapshot.queueCount,
        certificatesFetchDurationMs: snapshot.certificatesFetchDurationMs,
        billingFetchDurationMs: snapshot.billingFetchDurationMs,
        profileResolveDurationMs,
        totalDurationMs: Date.now() - patientMeStartedAt,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/profile/email-change/request') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const body = await parseJsonBody(req);
      const currentEmail = normalizeEmail(patient.email);
      const nextEmail = normalizeEmail(body?.nextEmail || body?.email || '');
      if (!currentEmail || !isLikelyPatientEmail(currentEmail)) {
        sendJson(res, 400, { error: 'Current account email is missing.' });
        return;
      }
      if (!nextEmail || !isLikelyPatientEmail(nextEmail)) {
        sendJson(res, 400, { error: 'A valid new email is required.' });
        return;
      }
      if (nextEmail === currentEmail) {
        sendJson(res, 400, { error: 'The new email matches your current email.' });
        return;
      }
      if (await patientAccountExists(nextEmail)) {
        sendJson(res, 409, { error: 'This email is already linked to another account.' });
        return;
      }

      const changeToken = issuePatientEmailChangeToken({
        currentEmail,
        nextEmail,
      });
      const confirmUrl = buildPatientEmailChangeConfirmUrl(req, changeToken);
      const expiresMinutes = Math.max(1, Math.round(PATIENT_EMAIL_CHANGE_TTL_MS / (1000 * 60)));
      const safeCurrent = currentEmail.replace(/</g, '&lt;');
      const safeNext = nextEmail.replace(/</g, '&lt;');
      const safeUrl = confirmUrl.replace(/"/g, '&quot;');

      await sendEmail({
        to: nextEmail,
        subject: 'Confirm your Onya Health email change',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0a1931">
            <h2 style="margin:0 0 12px">Confirm your email change</h2>
            <p style="margin:0 0 12px">We received a request to move your Onya Health account from <strong>${safeCurrent}</strong> to <strong>${safeNext}</strong>.</p>
            <p style="margin:0 0 16px">Click below to confirm. This link expires in ${expiresMinutes} minutes.</p>
            <p style="margin:0 0 20px">
              <a href="${safeUrl}" style="display:inline-block;background:#1a3d63;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:600">Confirm email change</a>
            </p>
            <p style="margin:0;color:#1a3d63">If you did not request this change, you can safely ignore this email.</p>
          </div>
        `,
        text: [
          'Confirm your email change',
          '',
          `We received a request to move your Onya Health account from ${currentEmail} to ${nextEmail}.`,
          `Open this link to confirm (expires in ${expiresMinutes} minutes):`,
          confirmUrl,
          '',
          'If you did not request this change, ignore this email.',
        ].join('\n'),
      });

      await appendAudit({
        type: 'PATIENT_EMAIL_CHANGE_REQUESTED',
        email: currentEmail,
        nextEmail,
      }).catch(() => undefined);

      sendJson(res, 200, {
        ok: true,
        message: `Verification link sent to ${nextEmail}.`,
        nextEmail,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/profile/email-change/consume') {
      const body = await parseJsonBody(req);
      const decoded = verifyPatientEmailChangeToken(body?.token || '');
      if (!decoded?.currentEmail || !decoded?.nextEmail) {
        sendJson(res, 400, { error: 'Invalid or expired email change link.' });
        return;
      }

      const currentEmail = normalizeEmail(decoded.currentEmail);
      const nextEmail = normalizeEmail(decoded.nextEmail);
      const supabaseConfig = getSupabaseConfig();

      const currentSupabaseAccount = supabaseConfig.enabled ? await findSupabasePatientByEmail(currentEmail) : null;
      const nextSupabaseAccount = supabaseConfig.enabled ? await findSupabasePatientByEmail(nextEmail) : null;
      const currentLocalAccount = await getPatientAccountByEmail(currentEmail);
      const nextLocalAccount = await getPatientAccountByEmail(nextEmail);
      const hasCurrentAccount = Boolean(currentSupabaseAccount || currentLocalAccount);
      const nextBelongsElsewhere = Boolean(
        nextSupabaseAccount && (!currentSupabaseAccount || nextSupabaseAccount.id !== currentSupabaseAccount.id)
      ) || Boolean(nextLocalAccount && !currentLocalAccount);

      if (nextBelongsElsewhere) {
        sendJson(res, 409, { error: 'This email is already linked to another account.' });
        return;
      }

      if (!hasCurrentAccount && (nextSupabaseAccount || nextLocalAccount)) {
        const profilePayload = await resolvePatientProfileByEmail({
          email: nextEmail,
          latestCertificate: null,
          account: nextLocalAccount || nextSupabaseAccount || null,
        });
        sendJson(res, 200, {
          ok: true,
          token: issuePatientToken(nextEmail),
          patient: profilePayload.patient,
          dietitian: profilePayload.dietitian,
          alreadyApplied: true,
        });
        return;
      }

      if (!hasCurrentAccount) {
        sendJson(res, 404, { error: 'No account was found for this email change request.' });
        return;
      }

      if (supabaseConfig.enabled) {
        try {
          await updateSupabasePatientEmail({
            currentEmail,
            nextEmail,
          });
        } catch (errorObject) {
          const statusCode = Number(errorObject?.status || 500);
          sendJson(res, statusCode === 409 ? 409 : 500, {
            error: errorObject?.message || 'Unable to update account email right now.',
          });
          return;
        }
      }

      const migratedCertificates = await migratePatientCertificateEmailReferences({
        currentEmail,
        nextEmail,
      }).catch((errorObject) => {
        error('patient.email_change.certificate_migration_failed', {
          currentEmail,
          nextEmail,
          message: errorObject?.message || String(errorObject),
        });
        return 0;
      });
      await migratePatientBillingForEmailChange({
        currentEmail,
        nextEmail,
      }).catch((errorObject) => {
        error('patient.email_change.billing_migration_failed', {
          currentEmail,
          nextEmail,
          message: errorObject?.message || String(errorObject),
        });
      });

      const localAccount = await updatePatientAccountProfile({
        email: currentEmail,
        nextEmail,
      }).catch(() => null);

      await appendAudit({
        type: 'PATIENT_EMAIL_CHANGE_CONFIRMED',
        email: nextEmail,
        previousEmail: currentEmail,
        migratedCertificates,
      }).catch(() => undefined);

      const profilePayload = await resolvePatientProfileByEmail({
        email: nextEmail,
        latestCertificate: null,
        account: supabaseConfig.enabled ? null : localAccount || nextLocalAccount || currentLocalAccount || null,
      });

      sendJson(res, 200, {
        ok: true,
        token: issuePatientToken(nextEmail),
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
        migratedCertificates,
      });
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/profile') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const body = await parseJsonBody(req);
      const currentEmail = normalizeEmail(patient.email);
      const requestedEmail = normalizeEmail(body?.email || currentEmail);
      const fullName = String(body?.fullName || '').trim();
      const dob = String(body?.dob || '').trim();
      const phone = String(body?.phone || '').trim();
      const address = String(body?.address || '').trim();
      const incomingPhotoPath = normalizeStoragePath(body?.profilePhotoPath || '');
      const incomingPhotoDataUrl = String(body?.profilePhotoDataUrl || '').trim();

      if (!fullName) {
        sendJson(res, 400, { error: 'Full name is required' });
        return;
      }
      if (!currentEmail || !isLikelyPatientEmail(currentEmail)) {
        sendJson(res, 400, { error: 'A valid account email is required' });
        return;
      }
      if (requestedEmail && requestedEmail !== currentEmail) {
        sendJson(res, 409, {
          error: 'Email changes require confirmation. Use the email change action in account settings.',
          code: 'EMAIL_CHANGE_REQUIRES_CONFIRMATION',
        });
        return;
      }

      let profilePhotoPath = incomingPhotoPath;
      try {
        if (incomingPhotoDataUrl) {
          const uploaded = await uploadPatientProfilePhotoDataUrl({
            email: patient.email,
            dataUrl: incomingPhotoDataUrl,
            userId: patient.user?.id || '',
          });
          profilePhotoPath = uploaded.profilePhotoPath;
        }
      } catch (uploadError) {
        sendJson(res, 400, {
          error: uploadError?.message || 'Unable to upload profile photo',
        });
        return;
      }

      const priorEmail = currentEmail;
      const resolvedEmail = priorEmail;
      const supabaseConfig = getSupabaseConfig();

      if (supabaseConfig.enabled) {
        try {
          await upsertSupabasePatientMetadata({
            email: resolvedEmail,
            fullName,
            dob,
            phone,
            address,
            profilePhotoPath,
          });
        } catch (errorObject) {
          error('patient.profile.update_supabase_failed', {
            email: patient.email,
            message: errorObject?.message || String(errorObject),
          });
          sendJson(res, 500, {
            error: 'Unable to save account settings right now. Please try again.',
          });
          return;
        }
      }

      const localAccount = await updatePatientAccountProfile({
        email: priorEmail,
        nextEmail: resolvedEmail,
        fullName,
        dob,
        phone,
        address,
        profilePhotoPath,
      }).catch(() => null);

      await appendAudit({
        type: 'PATIENT_PROFILE_UPDATED',
        email: resolvedEmail,
        previousEmail: priorEmail || null,
      }).catch(() => undefined);

      const profilePayload = await resolvePatientProfileByEmail({
        email: resolvedEmail,
        latestCertificate: null,
        account: supabaseConfig.enabled ? null : localAccount,
      });

      sendJson(res, 200, {
        ok: true,
        patient: profilePayload.patient,
        dietitian: profilePayload.dietitian,
        token: null,
      });
      return;
    }

    if (!MEAL_PLAN_FEATURE_ENABLED && routePath.startsWith('patient/meal-plan/')) {
      sendJson(res, 410, {
        ok: false,
        error: 'Meal planning is currently unavailable.',
      });
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/meal-plan/recipe-image') {
      const recipeId = String(url.searchParams.get('recipeId') || '').trim();
      const signature = String(url.searchParams.get('sig') || '').trim();
      if (!recipeId || !isValidMealPlanRecipeImageSignature(recipeId, signature)) {
        setCors(res, req);
        res.status(404).end('Not found');
        return;
      }

      try {
        const recipes = await listMealPlannerRecipesByIds([recipeId]);
        const normalized = normalizeRecipeListForProduct(recipes);
        const recipe = normalized.find((entry) => String(entry?.id || '').trim() === recipeId) || null;
        if (!recipe) {
          setCors(res, req);
          res.status(404).end('Not found');
          return;
        }

        const source = recipe?.source && typeof recipe.source === 'object' && !Array.isArray(recipe.source)
          ? recipe.source
          : {};
        const imageCandidate = normalizeRecipeImageToWebp(
          String(recipe?.imageUrl || source.image_url || source.imageUrl || '').trim()
        );
        if (!imageCandidate) {
          setCors(res, req);
          res.status(404).end('Not found');
          return;
        }

        setCors(res, req);
        res.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
        if (isWebpHttpImage(imageCandidate)) {
          res.redirect(302, imageCandidate);
          return;
        }

        const parsedDataImage = parseSupportedRecipeDataImageUri(imageCandidate);
        if (!parsedDataImage) {
          res.status(404).end('Not found');
          return;
        }
        const buffer = Buffer.from(parsedDataImage.body, 'base64');
        if (!buffer.length) {
          res.status(404).end('Not found');
          return;
        }
        res.setHeader('Content-Type', parsedDataImage.mime || 'application/octet-stream');
        res.setHeader('Content-Length', String(buffer.length));
        res.status(200).send(buffer);
      } catch (errorObject) {
        error('meal_plan.recipe_image_load_failed', {
          recipeId,
          message: errorObject?.message || String(errorObject),
        });
        setCors(res, req);
        res.status(404).end('Not found');
      }
      return;
    }

    if (req.method === 'GET' && routePath === 'patient/meal-plan/catalog') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const requestedLimit = Math.round(Number(url.searchParams.get('limit') || 60));
      const limit = Math.max(24, Math.min(120, Number.isFinite(requestedLimit) ? requestedLimit : 60));
      const includeGlobalGeneratedFallback = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('includeFallback') || url.searchParams.get('fallback') || '').toLowerCase()
      );

      try {
        const generatedCatalog = await loadPatientGeneratedRecipeCatalog({
          patientEmail: patient.email,
          cacheLimit: Math.max(2, Math.min(8, Math.ceil(limit / 12))),
          includeGlobalGeneratedFallback,
          targetLimit: limit,
        });

        const recipes = mapRecipeListForClient(normalizeRecipeListForProduct(generatedCatalog.recipes), req).slice(0, limit);

        const catalogSource =
          generatedCatalog.hydratedEntryCount > 0
            ? 'patient-generated'
            : generatedCatalog.recipes.length > 0
              ? 'generated-fallback'
              : 'empty';

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

    if (req.method === 'GET' && routePath === 'patient/meal-plan/latest') {
      const patient = await requirePatient(req, res);
      if (!patient) return;
      const includeDataImages = ['1', 'true', 'yes'].includes(
        String(url.searchParams.get('includeDataImages') || '').toLowerCase()
      );

      try {
        const latestEntry = await getLatestMealPlanGenerationCacheByPatientEmail(patient.email).catch((cacheError) => {
          error('meal_plan.latest_cache_lookup_failed', {
            email: normalizeEmail(patient.email),
            message: cacheError?.message || String(cacheError),
          });
          return null;
        });
        let selectedEntry = latestEntry;
        let hydrated = selectedEntry ? await hydrateMealPlanBundleFromCacheEntry(selectedEntry).catch((hydrateError) => {
          error('meal_plan.latest_cache_hydrate_failed', {
            email: normalizeEmail(patient.email),
            message: hydrateError?.message || String(hydrateError),
          });
          return null;
        }) : null;
        let fallbackCacheEntries = [];

        const selectedEntryIsRulesFallback = isRulesFallbackCacheEntry(selectedEntry);
        if (!hydrated || selectedEntryIsRulesFallback) {
          fallbackCacheEntries = await listMealPlanGenerationCacheByPatientEmail(patient.email, 12).catch((cacheError) => {
            error('meal_plan.latest_cache_list_failed', {
              email: normalizeEmail(patient.email),
              message: cacheError?.message || String(cacheError),
            });
            return [];
          });
          for (const cacheEntry of fallbackCacheEntries) {
            if (!cacheEntry) continue;
            if (
              selectedEntry &&
              String(cacheEntry.cacheKey || '').trim() === String(selectedEntry.cacheKey || '').trim()
            ) {
              continue;
            }
            if (selectedEntryIsRulesFallback && isRulesFallbackCacheEntry(cacheEntry)) {
              continue;
            }
            // Fall back to the newest hydration-valid cache entry when the latest row is incomplete.
            const fallbackHydrated = await hydrateMealPlanBundleFromCacheEntry(cacheEntry).catch((hydrateError) => {
              error('meal_plan.latest_cache_fallback_hydrate_failed', {
                email: normalizeEmail(patient.email),
                cacheKey: String(cacheEntry?.cacheKey || ''),
                message: hydrateError?.message || String(hydrateError),
              });
              return null;
            });
            if (!fallbackHydrated) continue;
            selectedEntry = cacheEntry;
            hydrated = fallbackHydrated;
            break;
          }
        }

        if (!hydrated) {
          sendJson(res, 200, {
            ok: true,
            found: false,
            mealPlan: null,
            recipes: [],
          });
          return;
        }

        const recipes = mapRecipeListForClient(normalizeRecipeListForProduct(hydrated.recipes), req, {
          inlineDataImages: includeDataImages,
        });
        let onboardingAnswers = sanitizeOnboardingAnswersForBundle(
          hydrated.onboardingAnswers || selectedEntry?.bundle?.onboardingAnswers || selectedEntry?.bundle?.answers || null
        );
        if (!onboardingAnswers) {
          const onboardingCacheEntries = fallbackCacheEntries.length > 0
            ? fallbackCacheEntries
            : await listMealPlanGenerationCacheByPatientEmail(patient.email, 12).catch((cacheError) => {
                error('meal_plan.latest_onboarding_cache_list_failed', {
                  email: normalizeEmail(patient.email),
                  message: cacheError?.message || String(cacheError),
                });
                return [];
              });
          for (const cacheEntry of onboardingCacheEntries) {
            onboardingAnswers = sanitizeOnboardingAnswersForBundle(
              cacheEntry?.bundle?.onboardingAnswers || cacheEntry?.bundle?.onboarding_answers || cacheEntry?.bundle?.answers || null
            );
            if (onboardingAnswers) break;
          }
        }

        sendJson(res, 200, {
          ok: true,
          found: true,
          generatedBy: selectedEntry?.source || 'openai',
          stage: selectedEntry?.stage || 'ai_recipes_v3',
          mealPlan: hydrated.mealPlan,
          recipes,
          onboardingAnswers: onboardingAnswers || null,
          cachedAt: selectedEntry?.updatedAt || selectedEntry?.lastUsedAt || selectedEntry?.createdAt || null,
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

    if (req.method === 'POST' && routePath === 'patient/meal-plan/generate') {
      const patient = await requirePatient(req, res);
      if (!patient) return;

      const body = await parseJsonBody(req);
      const answers = body?.answers && typeof body.answers === 'object' ? body.answers : {};
      const sanitizedOnboardingAnswers = sanitizeOnboardingAnswersForBundle(answers);
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
          const userCacheIsRulesFallback = isRulesFallbackCacheEntry(userCached);
          if (
            hydratedUserCache?.mealPlan &&
            Array.isArray(hydratedUserCache.recipes) &&
            hydratedUserCache.recipes.length > 0 &&
            !userCacheIsRulesFallback
          ) {
            const cachedStage = String(userCached?.stage || 'ai_recipes_v3');
            const cachedGeneratedBy =
              String(userCached?.source || '').trim().toLowerCase() === 'rules' || cachedStage.startsWith('rules_')
                ? 'rules'
                : 'openai';
            const cachedRecipes = normalizeRecipeListForProduct(hydratedUserCache.recipes, {
              generatedBy: cachedGeneratedBy,
            });
            const cachedRecipesForClient = mapRecipeListForClient(cachedRecipes, req, {
              inlineDataImages: true,
            });
            sendJson(res, 200, {
              ok: true,
              generatedBy: cachedGeneratedBy,
              stage: cachedStage,
              mealPlan: hydratedUserCache.mealPlan,
              recipes: cachedRecipesForClient,
              onboardingAnswers: hydratedUserCache.onboardingAnswers || sanitizedOnboardingAnswers || null,
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
          const sharedCacheIsRulesFallback = isRulesFallbackCacheEntry(sharedCached);
          if (
            hydratedSharedCache?.mealPlan &&
            Array.isArray(hydratedSharedCache.recipes) &&
            hydratedSharedCache.recipes.length > 0 &&
            !sharedCacheIsRulesFallback
          ) {
            const sharedCachedStage = String(sharedCached?.stage || 'ai_recipes_v3');
            const sharedCachedGeneratedBy =
              String(sharedCached?.source || '').trim().toLowerCase() === 'rules' || sharedCachedStage.startsWith('rules_')
                ? 'rules'
                : 'openai';
            const sharedCachedRecipes = normalizeRecipeListForProduct(hydratedSharedCache.recipes, {
              generatedBy: sharedCachedGeneratedBy,
            });
            const sharedCachedRecipesForClient = mapRecipeListForClient(sharedCachedRecipes, req, {
              inlineDataImages: true,
            });
            const assignedBundle = buildMealPlanCacheBundle({
              mealPlan: hydratedSharedCache.mealPlan,
              recipes: hydratedSharedCache.recipes,
              onboardingAnswers: sanitizedOnboardingAnswers,
            });
            if (assignedBundle) {
              const assignedHistoryCacheKey = buildMealPlanGenerationHistoryCacheKey({
                patientEmail: patient.email,
                intakeHash: cacheIdentity.intakeHash,
              });
              const assignmentWrites = [
                upsertMealPlanGenerationCache({
                  cacheKey: cacheIdentity.userCacheKey,
                  intakeHash: cacheIdentity.intakeHash,
                  patientEmail: patient.email,
                  source: sharedCachedGeneratedBy,
                  stage: sharedCachedStage,
                  bundle: assignedBundle,
                }).catch((persistError) => {
                  error('meal_plan.cache_assign_from_template_failed', {
                    email: normalizeEmail(patient.email),
                    cacheKey: cacheIdentity.userCacheKey,
                    message: persistError?.message || String(persistError),
                  });
                }),
                ...(assignedHistoryCacheKey
                  ? [
                      upsertMealPlanGenerationCache({
                        cacheKey: assignedHistoryCacheKey,
                        intakeHash: cacheIdentity.intakeHash,
                        patientEmail: patient.email,
                        source: sharedCachedGeneratedBy,
                        stage: sharedCachedStage,
                        bundle: assignedBundle,
                      }).catch((persistError) => {
                        error('meal_plan.cache_assign_history_from_template_failed', {
                          email: normalizeEmail(patient.email),
                          cacheKey: assignedHistoryCacheKey,
                          message: persistError?.message || String(persistError),
                        });
                      }),
                    ]
                  : []),
              ];
              await Promise.all(assignmentWrites);
            }
            sendJson(res, 200, {
              ok: true,
              generatedBy: sharedCachedGeneratedBy,
              stage: sharedCachedStage,
              mealPlan: hydratedSharedCache.mealPlan,
              recipes: sharedCachedRecipesForClient,
              onboardingAnswers: sanitizedOnboardingAnswers || null,
              intakeProfile: null,
              catalogSource: 'generated-cache-template',
              cached: true,
            });
            return;
          }
        }
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
          const generatedFallbackCatalog = await loadPatientGeneratedRecipeCatalog({
            patientEmail: patient.email,
            cacheLimit: 180,
            includeGlobalGeneratedFallback: true,
          });
          const fallbackBundle = buildRuleFallbackBundleFromCatalog({
            recipes: generatedFallbackCatalog.recipes,
            answers,
            includeSnack,
            seedSalt,
          });
          if (fallbackBundle) {
            resolvedBundle = fallbackBundle;
            generatedBy = 'rules';
            stage = 'rules_fallback_v1';
            catalogSource = 'rules-fallback-generated';
            info('meal_plan.rules_fallback_used', {
              email: normalizeEmail(patient.email),
              filteredRecipeCount: fallbackBundle.filteredRecipeCount,
              totalRecipeCount: fallbackBundle.totalRecipeCount,
              cacheEntryCount: generatedFallbackCatalog.cacheEntryCount,
              hydratedRecipeCount: generatedFallbackCatalog.hydratedEntryCount,
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
        const normalizedGeneratedRecipes = normalizeRecipeListForProduct(resolvedBundle.recipes, { generatedBy });
        if (!resolvedBundle.mealPlan || normalizedGeneratedRecipes.length === 0) {
          sendJson(res, 200, {
            ok: false,
            generatedBy,
            stage,
            error: 'Generated meal plan did not include a valid recipe catalog.',
          });
          return;
        }
        const normalizedResolvedBundle = {
          ...resolvedBundle,
          recipes: normalizedGeneratedRecipes,
        };

        const userBundlePayload = buildMealPlanCacheBundle({
          mealPlan: normalizedResolvedBundle.mealPlan,
          recipes: normalizedResolvedBundle.recipes,
          onboardingAnswers: sanitizedOnboardingAnswers,
        });
        const templateBundlePayload = buildMealPlanCacheBundle({
          mealPlan: normalizedResolvedBundle.mealPlan,
          recipes: normalizedResolvedBundle.recipes,
        });
        const shouldWriteTemplateCache = generatedBy === 'openai';
        const historyCacheKey = buildMealPlanGenerationHistoryCacheKey({
          patientEmail: patient.email,
          intakeHash: cacheIdentity.intakeHash,
          seedSalt,
        });
        await Promise.all([
          upsertMealPlannerRecipes(normalizedResolvedBundle.recipes),
          ...(userBundlePayload
            ? [
                upsertMealPlanGenerationCache({
                  cacheKey: cacheIdentity.userCacheKey,
                  intakeHash: cacheIdentity.intakeHash,
                  patientEmail: patient.email,
                  source: generatedBy,
                  stage,
                  bundle: userBundlePayload,
                }),
                ...(historyCacheKey
                  ? [
                      upsertMealPlanGenerationCache({
                        cacheKey: historyCacheKey,
                        intakeHash: cacheIdentity.intakeHash,
                        patientEmail: patient.email,
                        source: generatedBy,
                        stage,
                        bundle: userBundlePayload,
                      }),
                    ]
                  : []),
                ...(shouldWriteTemplateCache && templateBundlePayload
                  ? [
                      upsertMealPlanGenerationCache({
                        cacheKey: cacheIdentity.templateCacheKey,
                        intakeHash: cacheIdentity.intakeHash,
                        patientEmail: 'mealplan-template@onyahealth.local',
                        source: generatedBy,
                        stage,
                        bundle: templateBundlePayload,
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
          throw persistError;
        });
        sendJson(res, 200, {
          ok: true,
          generatedBy,
          stage,
          mealPlan: normalizedResolvedBundle.mealPlan,
          recipes: mapRecipeListForClient(normalizedResolvedBundle.recipes, req, {
            inlineDataImages: true,
          }),
          onboardingAnswers: sanitizedOnboardingAnswers || null,
          intakeProfile: normalizedResolvedBundle.intakeProfile || null,
          catalogSource,
          cached: false,
        });
      } catch (errorObject) {
        console.error('AI meal planner generation failed:', errorObject?.message || String(errorObject));
        sendJson(res, 500, {
          ok: false,
          generatedBy: 'openai',
          stage: 'ai_recipes_v3',
          error: 'Unable to generate meals right now.',
        });
      }
      return;
    }

    if (req.method === 'POST' && routePath === 'patient/meal-plan/podcast') {
      const patient = await requirePatient(req, res);
      if (!patient) return;
      if (!OPENAI_API_KEY) {
        sendJson(res, 500, {
          ok: false,
          error: 'OpenAI API key is not configured on the server.',
        });
        return;
      }

      const body = await parseJsonBody(req);
      const safeAnswers = sanitizeOnboardingAnswersForBundle(body?.answers) || {};
      const voiceProfile = normalizePodcastVoiceProfile(body?.voiceProfile);
      const voice = resolvePodcastVoice(voiceProfile);
      const weekNumber = Math.max(1, Math.min(52, Math.round(Number(body?.weekNumber || 1)) || 1));
      const weekKey = String(body?.weekKey || '').trim().slice(0, 80) || `${getWeekStartIsoKey(new Date())}:week-${weekNumber}`;
      const focusLabel = String(body?.focusLabel || safeAnswers?.primaryHealthFocus || '').trim().slice(0, 120);

      let script = sanitizePodcastScript(body?.script);
      if (!script) {
        script = buildFallbackPodcastScript({
          answers: safeAnswers,
          weekNumber,
          firstName: body?.firstName || safeAnswers?.firstName,
          mealPlan: body?.mealPlan,
          mealHighlights: body?.mealHighlights,
          focusLabel,
        });
      }

      const fallbackScript = buildFallbackPodcastScript({
        answers: safeAnswers,
        weekNumber,
        firstName: body?.firstName || safeAnswers?.firstName,
        mealPlan: body?.mealPlan,
        mealHighlights: body?.mealHighlights,
        focusLabel,
      });

      let words = script.split(/\s+/g).filter(Boolean);
      const minimumWords = 170;
      const maximumWords = 240;
      const absoluteMinimumWords = 140;
      while (words.length < minimumWords) {
        const combined = sanitizePodcastScript(`${script} ${fallbackScript}`);
        if (combined === script) break;
        script = combined;
        words = script.split(/\s+/g).filter(Boolean);
      }
      if (words.length > maximumWords) {
        script = words.slice(0, maximumWords).join(' ');
        words = script.split(/\s+/g).filter(Boolean);
      }
      if (words.length < absoluteMinimumWords) {
        sendJson(res, 400, {
          ok: false,
          error: 'Podcast script was too short to render a useful weekly briefing.',
        });
        return;
      }

      try {
        const ttsResponse = await fetch(OPENAI_TTS_ENDPOINT, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: OPENAI_TTS_MODEL,
            voice,
            input: script,
            instructions: resolvePodcastInstructions(voiceProfile),
            response_format: OPENAI_TTS_RESPONSE_FORMAT,
          }),
        });

        if (!ttsResponse.ok) {
          const errorText = await ttsResponse.text();
          let errorPayload = null;
          try {
            errorPayload = errorText ? JSON.parse(errorText) : null;
          } catch {
            errorPayload = null;
          }
          const message =
            String(errorPayload?.error?.message || '').trim() ||
            `OpenAI TTS request failed (${ttsResponse.status}).`;
          sendJson(res, 502, {
            ok: false,
            error: message,
          });
          return;
        }

        const audioArrayBuffer = await ttsResponse.arrayBuffer();
        const audioBuffer = Buffer.from(audioArrayBuffer);
        if (!audioBuffer.length) {
          sendJson(res, 502, {
            ok: false,
            error: 'OpenAI returned an empty audio payload.',
          });
          return;
        }

        const generatedAt = new Date().toISOString();
        sendJson(res, 200, {
          ok: true,
          weekKey,
          transcript: script,
          voiceProfile,
          voice,
          generatedAt,
          estimatedDurationSec: estimateSpeechDurationSeconds(script),
          audioMimeType: 'audio/mpeg',
          audioBase64: audioBuffer.toString('base64'),
          disclosure: 'This voice is AI-generated and not a human recording.',
        });
      } catch (errorObject) {
        error('meal_plan.podcast_generation_failed', {
          email: normalizeEmail(patient.email),
          message: errorObject?.message || String(errorObject),
        });
        sendJson(res, 500, {
          ok: false,
          error: 'Unable to generate the weekly podcast right now.',
        });
      }
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

      void reconcilePendingPaymentCertificatesForPatient(patient.email, req).catch((errorObject) => {
        error('patient.requests.payment_reconcile_failed', {
          email: patient.email,
          message: errorObject?.message || String(errorObject),
        });
      });
      const snapshot = await loadPatientPortalSnapshot(patient.email, { includeBilling: false });

      sendJson(res, 200, {
        count: snapshot.patientCertificates.length,
        requests: snapshot.requests,
      });
      info('patient.requests.loaded', {
        email: patient.email,
        requestCount: snapshot.patientCertificates.length,
        certificatesFetchDurationMs: snapshot.certificatesFetchDurationMs,
        billingFetchDurationMs: snapshot.billingFetchDurationMs,
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

      const supabaseConfig = getSupabaseConfig();
      if (supabaseConfig.enabled) {
        await registerDoctorAccount({
          email,
          password,
          fullName,
          providerType,
          registrationNumber,
          providerNumber,
          approvalStatus: 'pending',
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
          providerNumber,
          approvalStatus: 'pending',
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
        approvalStatus: 'pending',
      });

      info('doctor.register.success', { email });
      sendJson(res, 201, {
        approvalRequired: true,
        doctor: {
          email,
          name: account.fullName || fullName || email,
          providerType: account.providerType || providerType,
          registrationNumber: account.registrationNumber || registrationNumber,
          providerNumber: account.providerNumber || providerNumber,
          approvalStatus: account.approvalStatus || 'pending',
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

      const authToken = issueDoctorToken(account.email);
      sendJson(res, 200, {
        token: authToken,
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

    if (req.method === 'POST' && routePath === 'doctor/login') {
      const body = await parseJsonBody(req);
      const email = normalizeEmail(body.email);
      const password = String(body.password || '');

      let authenticatedDoctor = null;
      let pendingApproval = false;
      if (validateDoctorCredentials(email, password)) {
        authenticatedDoctor = {
          email,
          name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
          providerType: '',
          registrationNumber: '',
          providerNumber: '',
          approvalStatus: 'approved',
        };
      } else {
        const localAuth = await authenticateDoctorAccount({ email, password });
        if (localAuth?.email) {
          if (!doctorProfileHasApproval(localAuth, localAuth.email)) {
            pendingApproval = true;
          } else {
            authenticatedDoctor = {
              email: localAuth.email,
              name: localAuth.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
              providerType: localAuth.providerType || '',
              registrationNumber: localAuth.registrationNumber || '',
              providerNumber: localAuth.providerNumber || '',
              approvalStatus: localAuth.approvalStatus || 'approved',
            };
          }
        }

        const supabaseAuth = await authenticateDoctorViaSupabase(email, password);
        if (!authenticatedDoctor && supabaseAuth?.email) {
          if (!doctorProfileHasApproval(supabaseAuth, supabaseAuth.email)) {
            pendingApproval = true;
          } else {
            authenticatedDoctor = {
              email: supabaseAuth.email,
              name: supabaseAuth.fullName || process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
              providerType: supabaseAuth.providerType || '',
              registrationNumber: supabaseAuth.registrationNumber || '',
              providerNumber: supabaseAuth.providerNumber || '',
              approvalStatus: supabaseAuth.approvalStatus || 'approved',
            };
          }
        }

        if (supabaseAuth?.email) {
          await upsertDoctorAccount({
            email: supabaseAuth.email,
            fullName: supabaseAuth.fullName || '',
            providerType: supabaseAuth.providerType || '',
            registrationNumber: supabaseAuth.registrationNumber || '',
            providerNumber: supabaseAuth.providerNumber || '',
            approvalStatus: supabaseAuth.approvalStatus || 'pending',
            source: 'supabase',
          });
        }
      }

      if (!authenticatedDoctor) {
        if (pendingApproval) {
          sendJson(res, 403, { error: 'Doctor account is pending admin approval.' });
          return;
        }
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
          providerNumber: authenticatedDoctor.providerNumber || '',
          approvalStatus: authenticatedDoctor.approvalStatus || 'approved',
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
          providerNumber: normalizeProviderNumber(profile?.providerNumber || ''),
          approvalStatus: profile?.approvalStatus || (isDoctorAdminEmail(doctor.email) ? 'approved' : 'pending'),
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

      if (getSupabaseConfig().enabled) {
        try {
          await upsertSupabaseDoctorMetadata({
            email: normalizeEmail(doctor.email),
            fullName,
            providerType,
            registrationNumber,
            providerNumber,
            approvalStatus: updated?.approvalStatus || '',
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
          providerNumber: normalizeProviderNumber(updated?.providerNumber || providerNumber || ''),
          approvalStatus: updated?.approvalStatus || 'approved',
        },
      });
      return;
    }

    if (
      req.method === 'POST' &&
      segments.length === 4 &&
      segments[0] === 'doctor' &&
      segments[1] === 'accounts' &&
      segments[3] === 'approval'
    ) {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;
      if (!isDoctorAdminEmail(doctor.email)) {
        sendJson(res, 403, { error: 'Only an admin doctor can approve doctor accounts.' });
        return;
      }

      const targetEmail = normalizeEmail(decodeURIComponent(segments[2] || ''));
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

      let account = await getDoctorAccountByEmail(targetEmail);
      if (!account?.email && getSupabaseConfig().enabled) {
        const supabaseDoctor = await findSupabaseDoctorByEmail(targetEmail);
        if (supabaseDoctor?.email) {
          account = await upsertDoctorAccount({
            email: supabaseDoctor.email,
            fullName: supabaseDoctor.fullName || '',
            providerType: supabaseDoctor.providerType || '',
            registrationNumber: supabaseDoctor.registrationNumber || '',
            providerNumber: providerNumber || supabaseDoctor.providerNumber || '',
            approvalStatus: supabaseDoctor.approvalStatus || 'pending',
            source: 'supabase',
          });
        }
      }
      if (!account?.email) {
        sendJson(res, 404, { error: 'Doctor account not found' });
        return;
      }

      const updated = await setDoctorAccountApprovalStatus({
        email: targetEmail,
        approvalStatus,
        providerNumber,
      });

      if (getSupabaseConfig().enabled) {
        try {
          await upsertSupabaseDoctorMetadata({
            email: targetEmail,
            fullName: updated?.fullName || account.fullName || '',
            providerType: updated?.providerType || account.providerType || '',
            registrationNumber: updated?.registrationNumber || account.registrationNumber || '',
            providerNumber: updated?.providerNumber || account.providerNumber || '',
            approvalStatus,
          });
        } catch (errorObject) {
          info('doctor.approval.supabase_sync_failed', {
            email: targetEmail,
            message: errorObject?.message || String(errorObject),
          });
        }
      }

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

    if (req.method === 'GET' && routePath === 'doctor/certificates') {
      const doctor = await requireDoctor(req, res);
      if (!doctor) return;

      const statusFilter = getStatusFilterFromUrl(url);
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
      if (!isCertificateOpenForReview(current)) {
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
      if (!isCertificateOpenForReview(current)) {
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
      if (!isCertificateOpenForReview(current)) {
        sendJson(res, 409, {
          error: 'Certificate already reviewed',
          status: current.status,
        });
        return;
      }

      const updated = await updateCertificate(certId, (item) => {
        if (!isCertificateOpenForReview(item)) return item;

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
