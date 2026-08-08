import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { certificateMatchesDoctorPatientFilters } from './doctor-patient-filters.js';
import { warn } from './logger.js';

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');
const LOCAL_MEAL_PLANNER_RECIPES_PATH = path.resolve(
  process.cwd(),
  'frontend',
  'public',
  'weight-loss-reset-recipes.json'
);
const ENABLE_LOCAL_LEGACY_RECIPE_FALLBACK = String(process.env.ENABLE_LOCAL_LEGACY_RECIPE_FALLBACK || '0').trim() === '1';
const MEAL_RECIPE_IMAGE_BUCKET = String(
  process.env.MEAL_RECIPE_IMAGE_BUCKET || process.env.WEIGHT_LOSS_IMAGE_BUCKET || 'weight-loss-reset-images'
).trim();
const PATIENT_MEDICAL_RECORDS_BUCKET = String(
  process.env.PATIENT_MEDICAL_RECORDS_BUCKET || 'patient-medical-records'
).trim();
const MAX_PATIENT_MEDICAL_RECORD_BYTES = Math.max(
  128_000,
  Number(process.env.MAX_PATIENT_MEDICAL_RECORD_BYTES || 2_500_000)
);
const SUPPORTED_PATIENT_MEDICAL_RECORD_MIME_TO_EXTENSION = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
};
const MAX_MEAL_RECIPE_IMAGE_BYTES = Math.max(
  64_000,
  Number(process.env.MAX_MEAL_RECIPE_IMAGE_BYTES || 8 * 1024 * 1024)
);
const SUPPORTED_MEAL_RECIPE_IMAGE_MIME_TO_EXTENSION = {
  'image/webp': 'webp',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/avif': 'avif',
};
const CERTIFICATE_MESSAGE_EVENT_TYPES = new Set([
  'PATIENT_MESSAGE_SENT',
  'DOCTOR_MESSAGE_SENT',
  'MORE_INFO_REQUESTED',
]);

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_DEFAULT_KEY ||
    '';
  return {
    url,
    key,
    enabled: Boolean(url && key),
  };
}

function normalizeStoragePath(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.replace(/^\/+/, '');
}

function buildPublicStorageUrl(pathValue, bucket = MEAL_RECIPE_IMAGE_BUCKET) {
  const normalizedPath = normalizeStoragePath(pathValue);
  if (!normalizedPath) return '';
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;

  const config = getSupabaseConfig();
  if (!config.url) return '';
  const encodedPath = normalizedPath
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/');
  const encodedBucket = encodeURIComponent(String(bucket || MEAL_RECIPE_IMAGE_BUCKET).trim());
  return `${config.url}/storage/v1/object/public/${encodedBucket}/${encodedPath}`;
}

function parseSupportedRecipeDataImageUri(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const match = candidate.match(/^data:(image\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const mime = String(match[1] || '').trim().toLowerCase();
  if (!SUPPORTED_MEAL_RECIPE_IMAGE_MIME_TO_EXTENSION[mime]) return null;
  const body = String(match[2] || '').replace(/\s+/g, '');
  if (!body) return null;
  return { mime, body };
}

function parseSupportedPatientMedicalRecordDataUri(value) {
  const candidate = String(value || '').trim();
  if (!candidate) return null;
  const match = candidate.match(/^data:([a-z0-9.+-]+\/[a-z0-9.+-]+);base64,([a-z0-9+/=\r\n]+)$/i);
  if (!match) return null;
  const mime = String(match[1] || '').trim().toLowerCase();
  if (!SUPPORTED_PATIENT_MEDICAL_RECORD_MIME_TO_EXTENSION[mime]) return null;
  const body = String(match[2] || '').replace(/\s+/g, '');
  if (!body) return null;
  return { mime, body };
}

function normalizeStorageObjectPathSegment(value, fallback = 'recipe') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
  return normalized || fallback;
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
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
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

async function persistRecipeImageDataUriToStorage(row = {}, sourceRecord = {}) {
  const candidate = String(
    row?.image_url || row?.imageUrl || sourceRecord?.image_url || sourceRecord?.imageUrl || ''
  ).trim();
  if (!candidate) return '';
  if (/^https?:\/\//i.test(candidate)) return candidate;

  const parsed = parseSupportedRecipeDataImageUri(candidate);
  if (!parsed) return '';
  const config = getSupabaseConfig();
  if (!config.enabled) return '';

  const buffer = Buffer.from(parsed.body, 'base64');
  if (!buffer.length) return '';
  if (buffer.length > MAX_MEAL_RECIPE_IMAGE_BYTES) {
    warn('meal_planner_recipes.image_payload_too_large', {
      recipeId: String(row?.id || '').trim(),
      bytes: buffer.length,
      maxBytes: MAX_MEAL_RECIPE_IMAGE_BYTES,
    });
    return '';
  }

  const extension = SUPPORTED_MEAL_RECIPE_IMAGE_MIME_TO_EXTENSION[parsed.mime] || 'webp';
  const safeRecipeId = normalizeStorageObjectPathSegment(row?.id, 'recipe');
  const hash = createHash('sha1').update(buffer).digest('hex').slice(0, 14);
  const objectPath = `meal-planner/recipes/${safeRecipeId}-${hash}.${extension}`;

  await uploadBufferToSupabaseStorage({
    config,
    bucket: MEAL_RECIPE_IMAGE_BUCKET,
    objectPath,
    contentType: parsed.mime || 'application/octet-stream',
    bodyBuffer: buffer,
  });

  return buildPublicStorageUrl(objectPath, MEAL_RECIPE_IMAGE_BUCKET);
}

const EMPTY_DB = {
  certificates: [],
  auditLog: [],
  patientBilling: [],
  patientClinicalProfiles: [],
  mealPlanGenerationCache: [],
};

let writeQueue = Promise.resolve();
const patientIdCache = new Map();
let cachedLocalMealPlannerRecipes = null;
let localLegacyRecipeFallbackWarningLogged = false;
const supabaseMealPlannerRecipeByIdCache = new Map();
const PATIENT_ID_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.PATIENT_ID_CACHE_TTL_MS || 15 * 60 * 1000)
);
const SUPABASE_MEAL_PLANNER_RECIPE_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.SUPABASE_MEAL_PLANNER_RECIPE_CACHE_TTL_MS || 30 * 60 * 1000)
);
const SUPABASE_MEAL_PLANNER_RECIPE_CACHE_MAX_ENTRIES = Math.max(
  200,
  Number(process.env.SUPABASE_MEAL_PLANNER_RECIPE_CACHE_MAX_ENTRIES || 5000)
);
const LOCAL_MEAL_PLAN_CACHE_MAX_ENTRIES = Math.max(
  25,
  Number(process.env.LOCAL_MEAL_PLAN_CACHE_MAX_ENTRIES || 500),
);
const MEAL_PLAN_CACHE_EVENT_TYPE = 'MEAL_PLAN_CACHE_V1';
const SHARED_MEAL_PLAN_TEMPLATE_EMAIL = 'mealplan-template@onyahealth.local';
const ALLOWED_MEAL_RECIPE_GENERATED_BY = new Set(['openai', 'rules']);
const SUPABASE_CERTIFICATE_SERVICE_FIELDS = [
  'id',
  'submitted_at',
  'created_at',
  'updated_at',
  'status',
  'service_type',
  'risk_score',
  'risk_level',
  'reviewed_at',
  'denial_reason',
  'decision_reason',
  'assigned_provider_id',
];
const SUPABASE_CERTIFICATE_MEDICAL_FIELDS = [
  'request_id',
  'patient_email',
  'patient_full_name',
  'patient_dob',
  'patient_phone',
  'patient_address',
  'symptoms',
  'consult_reason',
  'work_or_study_context',
  'certificate_start_date',
  'certificate_end_date',
  'days_requested',
  'supporting_notes',
];
const SUPABASE_CERTIFICATE_OPTIONAL_MEDICAL_FIELDS = ['raw_submission'];
const supabaseMissingCertificateServiceFields = new Set();
const supabaseMissingCertificateMedicalFields = new Set();
const supabaseCertificateServiceFieldLookup = new Set(SUPABASE_CERTIFICATE_SERVICE_FIELDS);
const supabaseCertificateMedicalFieldLookup = new Set([
  ...SUPABASE_CERTIFICATE_MEDICAL_FIELDS,
  ...SUPABASE_CERTIFICATE_OPTIONAL_MEDICAL_FIELDS,
]);

function getSupabaseCertificateSelectFields(includeRawSubmission) {
  const serviceFields = SUPABASE_CERTIFICATE_SERVICE_FIELDS.filter(
    (fieldName) => !supabaseMissingCertificateServiceFields.has(fieldName)
  );
  const medicalFields = SUPABASE_CERTIFICATE_MEDICAL_FIELDS.filter(
    (fieldName) => !supabaseMissingCertificateMedicalFields.has(fieldName)
  );

  if (includeRawSubmission && !supabaseMissingCertificateMedicalFields.has('raw_submission')) {
    medicalFields.push('raw_submission');
  }

  return { serviceFields, medicalFields };
}

function markSupabaseCertificateFieldMissing(fieldName) {
  const normalized = String(fieldName || '').trim();
  if (!normalized) return false;

  if (supabaseCertificateServiceFieldLookup.has(normalized)) {
    const previousSize = supabaseMissingCertificateServiceFields.size;
    supabaseMissingCertificateServiceFields.add(normalized);
    return supabaseMissingCertificateServiceFields.size !== previousSize;
  }

  if (supabaseCertificateMedicalFieldLookup.has(normalized)) {
    const previousSize = supabaseMissingCertificateMedicalFields.size;
    supabaseMissingCertificateMedicalFields.add(normalized);
    return supabaseMissingCertificateMedicalFields.size !== previousSize;
  }

  return false;
}

function pruneSupabaseMealPlannerRecipeByIdCache() {
  const now = Date.now();
  for (const [recipeId, entry] of supabaseMealPlannerRecipeByIdCache.entries()) {
    if (!entry || entry.expiresAt <= now) {
      supabaseMealPlannerRecipeByIdCache.delete(recipeId);
    }
  }

  if (supabaseMealPlannerRecipeByIdCache.size <= SUPABASE_MEAL_PLANNER_RECIPE_CACHE_MAX_ENTRIES) return;
  const entries = [...supabaseMealPlannerRecipeByIdCache.entries()];
  entries.sort((left, right) => Number(left[1]?.expiresAt || 0) - Number(right[1]?.expiresAt || 0));
  while (entries.length > SUPABASE_MEAL_PLANNER_RECIPE_CACHE_MAX_ENTRIES) {
    const next = entries.shift();
    if (!next) break;
    supabaseMealPlannerRecipeByIdCache.delete(next[0]);
  }
}

function getCachedSupabaseMealPlannerRecipeById(recipeId) {
  const normalizedId = String(recipeId || '').trim();
  if (!normalizedId) return null;
  const entry = supabaseMealPlannerRecipeByIdCache.get(normalizedId);
  if (!entry) return null;
  if (Number(entry.expiresAt || 0) <= Date.now()) {
    supabaseMealPlannerRecipeByIdCache.delete(normalizedId);
    return null;
  }
  return entry.recipe || null;
}

function setCachedSupabaseMealPlannerRecipeById(recipe) {
  if (!recipe || typeof recipe !== 'object') return;
  const normalizedId = String(recipe.id || '').trim();
  if (!normalizedId) return;
  supabaseMealPlannerRecipeByIdCache.set(normalizedId, {
    recipe,
    expiresAt: Date.now() + SUPABASE_MEAL_PLANNER_RECIPE_CACHE_TTL_MS,
  });
  pruneSupabaseMealPlannerRecipeByIdCache();
}

function getCachedPatientId(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  const entry = patientIdCache.get(normalized);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    patientIdCache.delete(normalized);
    return null;
  }
  return entry.id || null;
}

function setCachedPatientId(email, id) {
  const normalized = normalizeEmail(email);
  const normalizedId = String(id || '').trim();
  if (!normalized || !normalizedId) return;
  patientIdCache.set(normalized, {
    id: normalizedId,
    expiresAt: Date.now() + PATIENT_ID_CACHE_TTL_MS,
  });
}

async function ensureDbFile() {
  await fs.mkdir(DATA_DIR, { recursive: true });

  try {
    await fs.access(DB_PATH);
  } catch {
    await fs.writeFile(DB_PATH, JSON.stringify(EMPTY_DB, null, 2), 'utf8');
  }
}

async function readDbRaw() {
  await ensureDbFile();
  const contents = await fs.readFile(DB_PATH, 'utf8');
  const parsed = JSON.parse(contents || '{}');
  return {
    certificates: Array.isArray(parsed?.certificates) ? parsed.certificates : [],
    auditLog: Array.isArray(parsed?.auditLog) ? parsed.auditLog : [],
    patientBilling: Array.isArray(parsed?.patientBilling) ? parsed.patientBilling : [],
    patientClinicalProfiles: Array.isArray(parsed?.patientClinicalProfiles) ? parsed.patientClinicalProfiles : [],
    mealPlanGenerationCache: Array.isArray(parsed?.mealPlanGenerationCache) ? parsed.mealPlanGenerationCache : [],
  };
}

async function writeDbRaw(db) {
  await ensureDbFile();
  const tempPath = `${DB_PATH}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(db, null, 2), 'utf8');
  await fs.rename(tempPath, DB_PATH);
}

async function mutateDb(mutator) {
  const mutation = writeQueue.then(async () => {
    const db = await readDbRaw();
    const result = await mutator(db);
    await writeDbRaw(db);
    return result;
  });

  writeQueue = mutation.catch(() => undefined);
  return mutation;
}

function mapDbToCertificate(item) {
  const normalizedStatus = normalizeCertificateStatus(item.status, 'submitted');
  return {
    id: item.id,
    createdAt: item.createdAt,
    status: normalizedStatus,
    serviceType: item.serviceType,
    risk: item.risk,
    certificateDraft: item.certificateDraft,
    rawSubmission: item.rawSubmission,
    decision: item.decision || null,
  };
}

function normalizeCertificateStatus(status, fallback = 'submitted') {
  const normalized = String(status || '').trim().toLowerCase();
  if (!normalized) return fallback;
  if (normalized === 'awaiting_payment') return 'pending';
  return normalized;
}

function extractCertificateEmail(certificate) {
  return normalizeEmail(
    certificate?.certificateDraft?.email ||
      certificate?.rawSubmission?.patient?.email ||
      certificate?.rawSubmission?.patientEmail ||
      certificate?.rawSubmission?.email ||
      certificate?.rawSubmission?.consult?.email ||
      ''
  );
}

function mapSupabaseRowToCertificate(row) {
  const rawMedicalRequest = row.medical_certificate_requests;
  const med = Array.isArray(rawMedicalRequest) ? rawMedicalRequest[0] || {} : rawMedicalRequest || {};

  const createdAt = row.submitted_at || row.created_at || new Date().toISOString();
  const rawSubmission = med.raw_submission || null;
  const workflow = rawSubmission?.workflow && typeof rawSubmission.workflow === 'object'
    ? rawSubmission.workflow
    : {};
  let status = normalizeCertificateStatus(row.status || 'submitted', 'submitted');
  if (
    ['submitted', 'pending', 'in_review', 'assigned', 'triaged'].includes(String(status).toLowerCase()) &&
    row.reviewed_at
  ) {
    if (row.denial_reason) {
      status = 'denied';
    } else if (row.decision_reason) {
      status = 'approved';
    }
  }
  const durationDays =
    med.days_requested ||
    (med.certificate_start_date && med.certificate_end_date
      ? Math.max(
          1,
          Math.ceil(
            (new Date(med.certificate_end_date).getTime() - new Date(med.certificate_start_date).getTime()) /
              (1000 * 60 * 60 * 24)
          )
        )
      : 1);

  const decisionNotes = row.decision_reason || row.denial_reason || '';
  const decisionTimestamp = row.reviewed_at || row.updated_at || null;
  const hasDecisionData = Boolean(decisionNotes || decisionTimestamp || row.assigned_provider_id);

  return {
    id: row.id,
    createdAt,
    status: normalizeCertificateStatus(status, 'submitted'),
    serviceType: row.service_type || 'doctor',
    risk: {
      score: row.risk_score ?? 0,
      level: row.risk_level || 'low',
      reasons: [],
    },
    certificateDraft: {
      fullName: med.patient_full_name || '',
      dob: med.patient_dob || '',
      email: med.patient_email || '',
      phone: med.patient_phone || '',
      address: med.patient_address || '',
      purpose: med.work_or_study_context || med.consult_reason || '',
      symptom: med.symptoms || '',
      description: med.supporting_notes || med.consult_reason || '',
      startDate: med.certificate_start_date || createdAt.split('T')[0],
      durationDays,
    },
    rawSubmission,
    decision: hasDecisionData
      ? {
          by: workflow.reviewedByName || row.assigned_provider_id || 'provider',
          byEmail: workflow.reviewedByEmail || '',
          providerType: workflow.providerType || '',
          registrationNumber: workflow.registrationNumber || '',
          at: workflow.reviewedAt || decisionTimestamp,
          notes: decisionNotes,
          result: workflow.decisionResult || status,
          certificateStatement: workflow.certificateStatement || '',
        }
      : null,
  };
}

function mapSupabaseRowToPatientBilling(row) {
  if (!row) return null;

  const patientEmail = normalizeEmail(row.patient_email);
  if (!patientEmail) return null;

  return {
    patientEmail,
    hasActiveUnlimited: Boolean(row.has_active_unlimited),
    plan: String(row.plan || 'pay_as_you_go'),
    subscriptionStatus: String(row.subscription_status || 'none'),
    stripeCustomerId: String(row.stripe_customer_id || ''),
    stripeSubscriptionId: String(row.stripe_subscription_id || ''),
    cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
    currentPeriodEnd: row.current_period_end ? String(row.current_period_end) : null,
    source: String(row.source || ''),
    updatedAt: row.updated_at ? String(row.updated_at) : null,
  };
}

function normalizeMealType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'breakfast' || normalized === 'lunch' || normalized === 'dinner' || normalized === 'snack') {
    return normalized;
  }
  return 'lunch';
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean);
}

function toFiniteNumberOrUndefined(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function roundToNearestTenth(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return undefined;
  return Math.round(parsed * 10) / 10;
}

function parseMinutesFromUnknown(value) {
  const numeric = toFiniteNumberOrUndefined(value);
  if (numeric !== undefined && numeric > 0) return Math.round(numeric);

  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;

  const hourMatch = text.match(/(\d+(?:\.\d+)?)\s*h(?:our|ours)?/);
  const minuteMatch = text.match(/(\d+(?:\.\d+)?)\s*m(?:in|ins|inute|inutes)?/);
  const numberMatch = text.match(/(\d+(?:\.\d+)?)/);
  let minutes = 0;
  if (hourMatch) minutes += Number(hourMatch[1]) * 60;
  if (minuteMatch) minutes += Number(minuteMatch[1]);
  if (!hourMatch && !minuteMatch && numberMatch) {
    minutes += Number(numberMatch[1]);
  }
  if (!Number.isFinite(minutes) || minutes <= 0) return undefined;
  return Math.max(1, Math.round(minutes));
}

function parseServesFromUnknown(value) {
  const numeric = roundToNearestTenth(value);
  if (numeric !== undefined) return numeric;

  const text = String(value || '').trim().toLowerCase();
  if (!text) return undefined;
  const matches = [...text.matchAll(/(\d+(?:\.\d+)?)/g)]
    .map((entry) => Number(entry[1]))
    .filter((entry) => Number.isFinite(entry) && entry > 0);
  if (matches.length === 0) return undefined;
  if (matches.length === 1) return roundToNearestTenth(matches[0]);
  const average = matches.reduce((sum, entry) => sum + entry, 0) / matches.length;
  return roundToNearestTenth(average);
}

function defaultServesForMealType(mealType) {
  if (mealType === 'snack') return 4;
  if (mealType === 'breakfast') return 2;
  return 3;
}

function defaultPrepMinutesForMealType(mealType) {
  if (mealType === 'snack') return 8;
  if (mealType === 'breakfast') return 10;
  return 12;
}

function defaultCookMinutesForMealType(mealType) {
  if (mealType === 'snack') return 5;
  if (mealType === 'breakfast') return 8;
  if (mealType === 'lunch') return 12;
  return 18;
}

function normalizeRecipeSource(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeSourceProviderValue(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-');
}

function normalizeGeneratedByFromRecipeSource(row = {}, source = {}) {
  const directGeneratedBy = String(row.generatedBy || row.generated_by || '').trim().toLowerCase();
  const sourceGeneratedBy = String(source.generatedBy || source.generated_by || '').trim().toLowerCase();
  const provider = normalizeSourceProviderValue(
    row.sourceProvider ||
      row.source_provider ||
      source.provider ||
      source.origin ||
      source.generator ||
      source.label ||
      sourceGeneratedBy ||
      directGeneratedBy
  );
  const model = String(row.model || source.model || '').trim().toLowerCase();
  const sourceUrl = String(source.url || '').trim().toLowerCase();

  if (
    directGeneratedBy === 'openai' ||
    sourceGeneratedBy === 'openai' ||
    provider.includes('openai') ||
    model.startsWith('gpt')
  ) {
    return 'openai';
  }
  if (
    directGeneratedBy === 'rules' ||
    sourceGeneratedBy === 'rules' ||
    provider.includes('rules-generated') ||
    provider === 'rules' ||
    provider === 'ai-generated'
  ) {
    return 'rules';
  }
  if (provider.includes('dietitians-australia') || sourceUrl.includes('dietitiansaustralia.org.au')) {
    return 'legacy';
  }
  return 'legacy';
}

function isMealPlannerRecipeEligible(recipe) {
  if (!recipe || typeof recipe !== 'object' || Array.isArray(recipe)) return false;
  const source = normalizeRecipeSource(recipe.source);
  const generatedBy = normalizeGeneratedByFromRecipeSource(recipe, source);
  const isActive = recipe.isActive !== false;
  return isActive && ALLOWED_MEAL_RECIPE_GENERATED_BY.has(generatedBy);
}

function mapRecipeRecordToMealPlannerRecipe(row = {}) {
  const calories = toFiniteNumberOrUndefined(row.calories);
  const protein = toFiniteNumberOrUndefined(row.protein);
  const carbs = toFiniteNumberOrUndefined(row.carbs);
  const fat = toFiniteNumberOrUndefined(row.fat);
  const source = normalizeRecipeSource(row.source);
  const sourceProvider = normalizeSourceProviderValue(
    row.source_provider || row.sourceProvider || source.provider || source.origin || source.generator || source.label || ''
  );
  const generatedBy = normalizeGeneratedByFromRecipeSource(row, source);
  const mealType = normalizeMealType(row.meal_type || row.mealType);
  const prepTimeColumn = toFiniteNumberOrUndefined(row.prep_time_minutes ?? row.prepTimeMinutes);
  const cookTimeColumn = toFiniteNumberOrUndefined(row.cook_time_minutes ?? row.cookTimeMinutes);
  const totalTimeColumn = toFiniteNumberOrUndefined(row.total_time_minutes ?? row.totalTimeMinutes);
  const sourcePrepTime =
    parseMinutesFromUnknown(source.prepTimeMinutes) ??
    parseMinutesFromUnknown(source.prepMinutes) ??
    parseMinutesFromUnknown(source.prepTime);
  const sourceCookTime =
    parseMinutesFromUnknown(source.cookTimeMinutes) ??
    parseMinutesFromUnknown(source.cookMinutes) ??
    parseMinutesFromUnknown(source.cookTime);
  const sourceTotalTime =
    parseMinutesFromUnknown(source.totalTimeMinutes) ??
    parseMinutesFromUnknown(source.totalMinutes) ??
    parseMinutesFromUnknown(source.totalTime);
  let prepTimeMinutes = prepTimeColumn ?? sourcePrepTime;
  let cookTimeMinutes = cookTimeColumn ?? sourceCookTime;
  let totalTimeMinutes = totalTimeColumn ?? sourceTotalTime;
  if (!totalTimeMinutes && prepTimeMinutes && cookTimeMinutes) {
    totalTimeMinutes = prepTimeMinutes + cookTimeMinutes;
  }
  if (!cookTimeMinutes && totalTimeMinutes) {
    if (prepTimeMinutes && totalTimeMinutes >= prepTimeMinutes) {
      cookTimeMinutes = Math.max(1, totalTimeMinutes - prepTimeMinutes);
    } else {
      cookTimeMinutes = totalTimeMinutes;
    }
  }
  if (!prepTimeMinutes && totalTimeMinutes && cookTimeMinutes && totalTimeMinutes >= cookTimeMinutes) {
    prepTimeMinutes = Math.max(1, totalTimeMinutes - cookTimeMinutes);
  }
  if (!prepTimeMinutes) {
    prepTimeMinutes = defaultPrepMinutesForMealType(mealType);
  }
  if (!cookTimeMinutes) {
    cookTimeMinutes = defaultCookMinutesForMealType(mealType);
  }
  if (!totalTimeMinutes && prepTimeMinutes && cookTimeMinutes) {
    totalTimeMinutes = prepTimeMinutes + cookTimeMinutes;
  }
  const serves =
    parseServesFromUnknown(row.serves) ??
    parseServesFromUnknown(source.serves) ??
    parseServesFromUnknown(source.servings) ??
    defaultServesForMealType(mealType);

  return {
    id: String(row.id || '').trim(),
    title: String(row.title || '').trim(),
    description: String(row.description || '').trim() || undefined,
    imageUrl: String(row.image_url || row.imageUrl || '').trim() || undefined,
    ingredients: Array.isArray(row.ingredients) ? row.ingredients : [],
    instructions: Array.isArray(row.instructions) ? row.instructions : [],
    calories: calories !== undefined ? Math.round(calories) : undefined,
    protein: protein !== undefined ? Math.round(protein * 10) / 10 : undefined,
    carbs: carbs !== undefined ? Math.round(carbs * 10) / 10 : undefined,
    fat: fat !== undefined ? Math.round(fat * 10) / 10 : undefined,
    mealType,
    dietaryTags: normalizeStringArray(row.dietary_tags ?? row.dietaryTags),
    allergens: normalizeStringArray(row.allergens),
    prepTimeMinutes: prepTimeMinutes !== undefined ? Math.round(prepTimeMinutes) : undefined,
    cookTimeMinutes: cookTimeMinutes !== undefined ? Math.round(cookTimeMinutes) : undefined,
    totalTimeMinutes: totalTimeMinutes !== undefined ? Math.round(totalTimeMinutes) : undefined,
    serves: serves !== undefined && serves > 0 ? Math.round(serves * 100) / 100 : undefined,
    estimatedCost: String((row.estimated_cost ?? row.estimatedCost) || '').trim() || undefined,
    source,
    isActive:
      typeof row.is_active === 'boolean'
        ? row.is_active
        : typeof row.isActive === 'boolean'
          ? row.isActive
          : true,
    generatedBy,
    sourceProvider: sourceProvider || undefined,
  };
}

function mapMealPlannerRecipeToSupabaseRecord(recipe = {}) {
  const normalized = mapRecipeRecordToMealPlannerRecipe(recipe);
  if (!normalized.id || !normalized.title) return null;

  const prepTimeMinutes = toFiniteNumberOrUndefined(normalized.prepTimeMinutes);
  const cookTimeMinutes = toFiniteNumberOrUndefined(normalized.cookTimeMinutes);
  const totalTimeMinutes = toFiniteNumberOrUndefined(normalized.totalTimeMinutes);
  const serves = toFiniteNumberOrUndefined(normalized.serves);
  const calories = toFiniteNumberOrUndefined(normalized.calories);
  const protein = toFiniteNumberOrUndefined(normalized.protein);
  const carbs = toFiniteNumberOrUndefined(normalized.carbs);
  const fat = toFiniteNumberOrUndefined(normalized.fat);
  const source = normalizeRecipeSource(normalized.source);
  const sourceImageCandidate = String(source.image_url || source.imageUrl || '').trim();
  const normalizedImageUrl = String(normalized.imageUrl || sourceImageCandidate || '').trim() || undefined;
  const sourceProvider = normalizeSourceProviderValue(
    normalized.sourceProvider || source.provider || source.origin || source.generator || source.label || ''
  );
  const generatedBy = normalizeGeneratedByFromRecipeSource(normalized, source);
  const isActive =
    typeof normalized.isActive === 'boolean'
      ? normalized.isActive
      : ALLOWED_MEAL_RECIPE_GENERATED_BY.has(generatedBy);
  const sourceWithFallbacks = {
    ...source,
    serves: source.serves ?? source.servings ?? (serves !== undefined ? Math.round(serves * 100) / 100 : undefined),
    prepTimeMinutes: source.prepTimeMinutes ?? (prepTimeMinutes !== undefined ? Math.round(prepTimeMinutes) : undefined),
    cookTimeMinutes: source.cookTimeMinutes ?? (cookTimeMinutes !== undefined ? Math.round(cookTimeMinutes) : undefined),
    totalTimeMinutes: source.totalTimeMinutes ?? (totalTimeMinutes !== undefined ? Math.round(totalTimeMinutes) : undefined),
    prepTime:
      source.prepTime ??
      (prepTimeMinutes !== undefined && prepTimeMinutes > 0 ? `${Math.round(prepTimeMinutes)} min` : undefined),
    cookTime:
      source.cookTime ??
      (cookTimeMinutes !== undefined && cookTimeMinutes > 0 ? `${Math.round(cookTimeMinutes)} min` : undefined),
    totalTime:
      source.totalTime ??
      (totalTimeMinutes !== undefined && totalTimeMinutes > 0 ? `${Math.round(totalTimeMinutes)} min` : undefined),
    generatedBy: source.generatedBy || generatedBy || undefined,
    provider: source.provider || sourceProvider || (generatedBy === 'openai' ? 'openai' : generatedBy === 'rules' ? 'rules-generated' : undefined),
    image_url: normalizedImageUrl || undefined,
    imageUrl: normalizedImageUrl || undefined,
  };

  return {
    id: normalized.id,
    title: normalized.title,
    description: normalized.description || null,
    image_url: normalizedImageUrl || undefined,
    ingredients: Array.isArray(normalized.ingredients) ? normalized.ingredients : [],
    instructions: Array.isArray(normalized.instructions) ? normalized.instructions : [],
    calories: calories === undefined ? null : Math.round(calories),
    protein: protein === undefined ? null : Math.round(protein),
    carbs: carbs === undefined ? null : Math.round(carbs),
    fat: fat === undefined ? null : Math.round(fat),
    meal_type: normalizeMealType(normalized.mealType),
    dietary_tags: normalizeStringArray(normalized.dietaryTags),
    allergens: normalizeStringArray(normalized.allergens),
    prep_time_minutes: prepTimeMinutes === undefined ? null : Math.round(prepTimeMinutes),
    cook_time_minutes: cookTimeMinutes === undefined ? null : Math.round(cookTimeMinutes),
    total_time_minutes: totalTimeMinutes === undefined ? null : Math.round(totalTimeMinutes),
    serves: serves === undefined ? null : Math.round(serves * 100) / 100,
    estimated_cost: normalized.estimatedCost ? String(normalized.estimatedCost) : null,
    source: sourceWithFallbacks,
    is_active: Boolean(isActive),
    generated_by: generatedBy || 'legacy',
    source_provider: sourceProvider || null,
    updated_at: new Date().toISOString(),
  };
}

function sanitizeMealPlanCacheKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9:_-]/g, '')
    .slice(0, 220);
}

function sanitizeMealPlanIntakeHash(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '')
    .slice(0, 120);
}

function normalizeRecipeIdList(value, limit = 1200) {
  const source = Array.isArray(value) ? value : [];
  const max = Math.max(1, Math.min(2000, Number(limit || 1200)));
  const output = [];
  const seen = new Set();
  for (const entry of source) {
    const id = String(entry || '').trim();
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    output.push(id);
    if (output.length >= max) break;
  }
  return output;
}

function extractRecipeIdsFromMealPlan(mealPlan) {
  if (!mealPlan || typeof mealPlan !== 'object' || Array.isArray(mealPlan)) return [];
  const days = Array.isArray(mealPlan.days) ? mealPlan.days : [];
  const collected = [];
  for (const day of days) {
    const meals = day?.meals && typeof day.meals === 'object' && !Array.isArray(day.meals) ? day.meals : {};
    const breakfast = String(meals.breakfast || '').trim();
    const lunch = String(meals.lunch || '').trim();
    const dinner = String(meals.dinner || '').trim();
    if (breakfast) collected.push(breakfast);
    if (lunch) collected.push(lunch);
    if (dinner) collected.push(dinner);
    if (Array.isArray(meals.snacks)) {
      for (const snackId of meals.snacks) {
        const snack = String(snackId || '').trim();
        if (snack) collected.push(snack);
      }
    }
  }
  return normalizeRecipeIdList(collected);
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

function normalizeStringArrayForCache(value, limit = 24) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => String(entry || '').trim()).filter(Boolean).slice(0, limit);
}

function normalizeOnboardingAnswersForCache(answers) {
  if (!answers || typeof answers !== 'object' || Array.isArray(answers)) return undefined;
  const payload = answers;
  const selectedMealTypes = normalizeCoreMealTypesForCache(payload.selectedMealTypes);
  const numericMealsPerDay = Math.round(Number(payload.mealsPerDay || selectedMealTypes.length || 0));
  const mealsPerDay = Number.isFinite(numericMealsPerDay)
    ? Math.max(2, Math.min(3, numericMealsPerDay || selectedMealTypes.length || 3))
    : selectedMealTypes.length || 3;
  return {
    firstName: String(payload.firstName || '').trim().slice(0, 64) || undefined,
    age: Number.isFinite(Number(payload.age)) ? Math.round(Number(payload.age)) : undefined,
    gender: String(payload.gender || '').trim().slice(0, 24) || undefined,
    heightCm: Number.isFinite(Number(payload.heightCm)) ? Math.round(Number(payload.heightCm)) : undefined,
    currentWeightKg: Number.isFinite(Number(payload.currentWeightKg))
      ? Math.round(Number(payload.currentWeightKg) * 10) / 10
      : undefined,
    goalWeightKg: Number.isFinite(Number(payload.goalWeightKg))
      ? Math.round(Number(payload.goalWeightKg) * 10) / 10
      : undefined,
    mainGoal: String(payload.mainGoal || '').trim().slice(0, 220) || undefined,
    motivation: String(payload.motivation || '').trim().slice(0, 260) || undefined,
    timeframeWeeks: Number.isFinite(Number(payload.timeframeWeeks)) ? Math.round(Number(payload.timeframeWeeks)) : undefined,
    biggestChallenge: String(payload.biggestChallenge || '').trim().slice(0, 120) || undefined,
    primaryHealthFocus: String(payload.primaryHealthFocus || '').trim().slice(0, 120) || undefined,
    dietaryRequirements: normalizeStringArrayForCache(payload.dietaryRequirements, 16),
    favoriteFoods: normalizeStringArrayForCache(payload.favoriteFoods, 20),
    allergiesText: String(payload.allergiesText || '').trim().slice(0, 320) || undefined,
    allergyChips: normalizeStringArrayForCache(payload.allergyChips, 20),
    dislikes: String(payload.dislikes || '').trim().slice(0, 320) || undefined,
    cookingSkill: String(payload.cookingSkill || '').trim().slice(0, 80) || undefined,
    selectedMealTypes,
    mealsPerDay,
    daysPerWeek: Number.isFinite(Number(payload.daysPerWeek)) ? Math.max(2, Math.min(7, Math.round(Number(payload.daysPerWeek)))) : undefined,
    budgetPreference: String(payload.budgetPreference || '').trim().slice(0, 80) || undefined,
    groceryPreference: String(payload.groceryPreference || '').trim().slice(0, 120) || undefined,
    prepDay: String(payload.prepDay || '').trim().slice(0, 32) || undefined,
    preferredMealStyle: String(payload.preferredMealStyle || '').trim().slice(0, 120) || undefined,
    preferredCuisines: normalizeStringArrayForCache(payload.preferredCuisines, 16),
    supportWanted: String(payload.supportWanted || '').trim().slice(0, 24) || undefined,
    supportAreas: normalizeStringArrayForCache(payload.supportAreas, 20),
  };
}

function normalizeMealPlanGenerationBundle(bundle) {
  if (!bundle || typeof bundle !== 'object' || Array.isArray(bundle)) return null;
  const mealPlan = bundle.mealPlan && typeof bundle.mealPlan === 'object' && !Array.isArray(bundle.mealPlan) ? bundle.mealPlan : null;
  const recipes = Array.isArray(bundle.recipes)
    ? bundle.recipes
        .map((recipe) => mapRecipeRecordToMealPlannerRecipe(recipe))
        .filter((recipe) => recipe.id && recipe.title && Array.isArray(recipe.ingredients))
    : [];
  const recipeIdsFromBundle = normalizeRecipeIdList(bundle.recipeIds ?? bundle.recipe_ids);
  const recipeIdsFromRecipes = normalizeRecipeIdList(recipes.map((recipe) => recipe.id));
  const recipeIdsFromPlan = extractRecipeIdsFromMealPlan(mealPlan);
  const recipeIds = normalizeRecipeIdList([...recipeIdsFromBundle, ...recipeIdsFromRecipes, ...recipeIdsFromPlan]);
  const onboardingAnswers = normalizeOnboardingAnswersForCache(
    bundle.onboardingAnswers || bundle.onboarding_answers || bundle.answers || null
  );
  if (!mealPlan || recipeIds.length === 0) return null;
  return {
    mealPlan,
    recipeIds,
    recipes,
    onboardingAnswers,
  };
}

function mapMealPlanGenerationCacheRow(row = {}) {
  const cacheKey = sanitizeMealPlanCacheKey(row.cache_key ?? row.cacheKey);
  if (!cacheKey) return null;
  const intakeHash = sanitizeMealPlanIntakeHash(row.intake_hash ?? row.intakeHash);
  if (!intakeHash) return null;
  const cacheLooksShared = cacheKey.includes(':template:');
  const patientEmail = normalizeEmail(row.patient_email ?? row.patientEmail) || (cacheLooksShared ? SHARED_MEAL_PLAN_TEMPLATE_EMAIL : '');
  if (!patientEmail) return null;
  const source = String(row.source || 'openai').trim() || 'openai';
  const stage = String(row.stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2';
  const bundle = normalizeMealPlanGenerationBundle(row.bundle);
  if (!bundle) return null;
  return {
    cacheKey,
    intakeHash,
    patientEmail,
    source,
    stage,
    bundle,
    createdAt: row.created_at ? String(row.created_at) : row.createdAt ? String(row.createdAt) : null,
    updatedAt: row.updated_at ? String(row.updated_at) : row.updatedAt ? String(row.updatedAt) : null,
    lastUsedAt: row.last_used_at ? String(row.last_used_at) : row.lastUsedAt ? String(row.lastUsedAt) : null,
  };
}

function shouldFallbackMealPlanCacheToRequestEvents(errorObject) {
  const status = Number(errorObject?.status || 0);
  const code = String(errorObject?.data?.code || '').trim();
  const message = String(errorObject?.data?.message || errorObject?.message || '').toLowerCase();
  if (status === 404) return true;
  if (code === '42P01') return true;
  if (message.includes('meal_plan_generation_cache') && (message.includes('does not exist') || message.includes('not found'))) {
    return true;
  }
  return false;
}

function buildPatientBillingUpsertBody(patientEmail, patch = {}) {
  const normalizedEmail = normalizeEmail(patientEmail);
  const hasActiveUnlimited = Boolean(patch.hasActiveUnlimited);
  const plan = String(patch.plan || (hasActiveUnlimited ? 'unlimited' : 'pay_as_you_go')).trim();
  const subscriptionStatus = String(
    patch.subscriptionStatus || (hasActiveUnlimited ? 'active' : 'none')
  ).trim();
  const stripeCustomerId = String(patch.stripeCustomerId || '').trim();
  const stripeSubscriptionId = String(patch.stripeSubscriptionId || '').trim();
  const cancelAtPeriodEnd = Boolean(patch.cancelAtPeriodEnd);
  const currentPeriodEnd = patch.currentPeriodEnd ? String(patch.currentPeriodEnd) : null;

  return {
    patient_email: normalizedEmail,
    has_active_unlimited: hasActiveUnlimited,
    plan,
    subscription_status: subscriptionStatus,
    stripe_customer_id: stripeCustomerId || null,
    stripe_subscription_id: stripeSubscriptionId || null,
    cancel_at_period_end: cancelAtPeriodEnd,
    current_period_end: currentPeriodEnd,
    source: String(patch.source || '').trim() || null,
    updated_at: new Date().toISOString(),
  };
}

function toSupabaseRequestStatus(status) {
  const normalized = normalizeCertificateStatus(status, 'submitted');
  if (normalized === 'pending') return 'submitted';
  return normalized;
}

function toSupabaseRiskLevel(level) {
  const normalized = String(level || 'low').toLowerCase();
  if (['low', 'medium', 'high', 'urgent'].includes(normalized)) {
    return normalized;
  }
  return 'low';
}

function fromSupabaseRequestStatus(status) {
  return normalizeCertificateStatus(status, 'submitted');
}

async function supabaseRequest(endpoint, options = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    throw new Error('Supabase config missing (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  }

  const response = await fetch(`${config.url}/rest/v1/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
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
    const error = new Error(`Supabase request failed (${response.status}) ${JSON.stringify(data)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function supabaseAuthAdminRequest(endpoint, options = {}) {
  const config = getSupabaseConfig();
  if (!config.enabled) {
    throw new Error('Supabase config missing (SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)');
  }

  const response = await fetch(`${config.url}/auth/v1/admin/${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      apikey: config.key,
      Authorization: `Bearer ${config.key}`,
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
    const error = new Error(`Supabase auth admin request failed (${response.status}) ${JSON.stringify(data)}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

async function listCertificatesLocal() {
  const db = await readDbRaw();
  return db.certificates.map(mapDbToCertificate);
}

async function listCertificatesByPatientEmailLocal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const certificates = await listCertificatesLocal();
  return certificates
    .filter((certificate) => extractCertificateEmail(certificate) === normalizedEmail)
    .sort((a, b) => String(b?.createdAt || '').localeCompare(String(a?.createdAt || '')));
}

async function searchCertificatesByPatientNameLocal(query, limit = 250, filters = null) {
  const normalizedQuery = String(query || '').trim().toLocaleLowerCase('en-AU');
  if (normalizedQuery.length < 2) return [];
  const resolvedLimit = Math.min(500, Math.max(1, Number(limit || 250)));
  const certificates = await listCertificatesLocal();
  return certificates
    .filter((certificate) =>
      String(certificate?.certificateDraft?.fullName || '')
        .trim()
        .toLocaleLowerCase('en-AU')
        .includes(normalizedQuery)
    )
    .filter((certificate) => !filters || certificateMatchesDoctorPatientFilters(certificate, filters))
    .sort((left, right) => String(right?.createdAt || '').localeCompare(String(left?.createdAt || '')))
    .slice(0, resolvedLimit);
}

async function getCertificateByIdLocal(id) {
  const db = await readDbRaw();
  const item = db.certificates.find((entry) => entry.id === id);
  return item ? mapDbToCertificate(item) : null;
}

async function createCertificateLocal(certificate) {
  return mutateDb((db) => {
    db.certificates.push(certificate);
    db.auditLog.push({
      type: 'CERTIFICATE_CREATED',
      certificateId: certificate.id,
      at: new Date().toISOString(),
    });
    return certificate;
  });
}

async function updateCertificateLocal(id, updater) {
  return mutateDb((db) => {
    const index = db.certificates.findIndex((item) => item.id === id);
    if (index === -1) {
      return null;
    }

    const current = db.certificates[index];
    const updated = updater(current);
    db.certificates[index] = updated;
    db.auditLog.push({
      type: 'CERTIFICATE_UPDATED',
      certificateId: id,
      at: new Date().toISOString(),
      status: updated.status,
    });
    return updated;
  });
}

async function appendAuditLocal(entry) {
  return mutateDb((db) => {
    db.auditLog.push({
      ...entry,
      at: new Date().toISOString(),
    });
  });
}

function mapCertificateMessageEvent(entry, index = 0) {
  const payload = entry?.payload && typeof entry.payload === 'object' ? entry.payload : entry || {};
  const eventType = String(entry?.event_type || entry?.type || payload?.type || '').trim().toUpperCase();
  if (!CERTIFICATE_MESSAGE_EVENT_TYPES.has(eventType)) return null;

  const message = String(payload.message || payload.notes || '').trim();
  if (!message) return null;

  const createdAt = String(entry?.created_at || entry?.at || payload?.createdAt || payload?.at || '').trim();
  const sender = eventType === 'PATIENT_MESSAGE_SENT' ? 'patient' : 'doctor';
  return {
    id: String(payload.messageId || `${eventType.toLowerCase()}-${createdAt || index}`).trim(),
    sender,
    senderName: String(payload.senderName || (sender === 'doctor' ? 'Doctor' : 'Patient')).trim(),
    message,
    createdAt,
  };
}

function buildCertificateMessageSummaries(entries = []) {
  const summaries = Object.create(null);

  entries.forEach((entry, index) => {
    const requestId = String(entry?.request_id || entry?.certificateId || entry?.requestId || '').trim();
    const message = mapCertificateMessageEvent(entry, index);
    if (!requestId || !message) return;

    const summary = summaries[requestId] || {
      messageCount: 0,
      latestSender: null,
      latestMessageAt: null,
      needsReply: false,
    };
    summary.messageCount += 1;

    if (
      !summary.latestMessageAt ||
      !message.createdAt ||
      String(message.createdAt).localeCompare(String(summary.latestMessageAt)) >= 0
    ) {
      summary.latestSender = message.sender;
      summary.latestMessageAt = message.createdAt || null;
      summary.needsReply = message.sender === 'patient';
    }

    summaries[requestId] = summary;
  });

  return summaries;
}

function truncateClinicalText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function normalizePatientClinicalTextEntries(source) {
  if (!Array.isArray(source)) return [];
  return source
    .slice(0, 200)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const title = truncateClinicalText(entry.title, 200);
      const details = truncateClinicalText(entry.details, 4000);
      if (!title && !details) return null;
      return {
        id: truncateClinicalText(entry.id, 120) || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        title: title || 'Untitled',
        details,
        createdAt: truncateClinicalText(entry.createdAt, 64) || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function normalizePatientTestResults(source) {
  if (!Array.isArray(source)) return [];
  return source
    .slice(0, 200)
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const name = truncateClinicalText(entry.name, 200);
      const summary = truncateClinicalText(entry.summary, 4000);
      if (!name && !summary) return null;
      return {
        id: truncateClinicalText(entry.id, 120) || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        name: name || 'Untitled result',
        summary,
        testDate: truncateClinicalText(entry.testDate, 64) || new Date().toISOString(),
        fileName: truncateClinicalText(entry.fileName, 255),
        mimeType: truncateClinicalText(entry.mimeType, 100),
        fileSize: Math.max(0, Number(entry.fileSize || 0)),
        storagePath: truncateClinicalText(entry.storagePath, 600),
        createdAt: truncateClinicalText(entry.createdAt, 64) || new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

function normalizePatientClinicalProfileValue(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    medicalHistory: normalizePatientClinicalTextEntries(source.medicalHistory),
    allergies: normalizePatientClinicalTextEntries(source.allergies),
    medications: normalizePatientClinicalTextEntries(source.medications),
    lifestyleNotes: normalizePatientClinicalTextEntries(source.lifestyleNotes),
    testResults: normalizePatientTestResults(source.testResults),
  };
}

function mapPatientClinicalProfileRow(row) {
  if (!row || typeof row !== 'object') return normalizePatientClinicalProfileValue(null);
  return normalizePatientClinicalProfileValue({
    medicalHistory: row.medical_history ?? row.medicalHistory,
    allergies: row.allergies,
    medications: row.medications,
    lifestyleNotes: row.lifestyle_notes ?? row.lifestyleNotes,
    testResults: row.test_results ?? row.testResults,
  });
}

function mapPatientDirectoryRow(row) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const email = normalizeEmail(row.email);
  if (!id || !email) return null;
  return {
    id,
    email,
    fullName: String(row.full_name || row.fullName || '').trim(),
    phone: String(row.phone || '').trim(),
    address: String(row.address || '').trim(),
  };
}

async function getPatientClinicalProfileLocal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return normalizePatientClinicalProfileValue(null);
  const db = await readDbRaw();
  const row = db.patientClinicalProfiles.find(
    (entry) => normalizeEmail(entry?.patientEmail || entry?.email) === normalizedEmail
  );
  return mapPatientClinicalProfileRow(row?.profile || row);
}

async function upsertPatientClinicalProfileLocal(email, profile) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const normalizedProfile = normalizePatientClinicalProfileValue(profile);
  return mutateDb((db) => {
    const index = db.patientClinicalProfiles.findIndex(
      (entry) => normalizeEmail(entry?.patientEmail || entry?.email) === normalizedEmail
    );
    const row = {
      patientEmail: normalizedEmail,
      profile: normalizedProfile,
      updatedAt: new Date().toISOString(),
    };
    if (index === -1) {
      db.patientClinicalProfiles.push(row);
    } else {
      db.patientClinicalProfiles[index] = row;
    }
    return normalizedProfile;
  });
}

async function listCertificateMessagesLocal(requestId) {
  const normalizedId = String(requestId || '').trim();
  if (!normalizedId) return [];

  const db = await readDbRaw();
  return db.auditLog
    .filter((entry) => String(entry?.certificateId || entry?.requestId || '').trim() === normalizedId)
    .map((entry, index) => mapCertificateMessageEvent(entry, index))
    .filter(Boolean)
    .sort((left, right) => String(left.createdAt || '').localeCompare(String(right.createdAt || '')))
    .slice(-100);
}

async function getCertificateMessageSummariesLocal(requestIds) {
  const normalizedIds = new Set(
    (Array.isArray(requestIds) ? requestIds : [])
      .map((requestId) => String(requestId || '').trim())
      .filter(Boolean)
  );
  if (normalizedIds.size === 0) return Object.create(null);

  const db = await readDbRaw();
  return buildCertificateMessageSummaries(
    db.auditLog.filter((entry) =>
      normalizedIds.has(String(entry?.certificateId || entry?.requestId || '').trim())
    )
  );
}

async function getPatientBillingLocal(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const db = await readDbRaw();
  const row = db.patientBilling.find((entry) => normalizeEmail(entry?.patientEmail || entry?.patient_email) === normalizedEmail);
  if (!row) return null;

  return {
    patientEmail: normalizedEmail,
    hasActiveUnlimited: Boolean(row.hasActiveUnlimited ?? row.has_active_unlimited),
    plan: String(row.plan || 'pay_as_you_go'),
    subscriptionStatus: String(row.subscriptionStatus || row.subscription_status || 'none'),
    stripeCustomerId: String(row.stripeCustomerId || row.stripe_customer_id || ''),
    stripeSubscriptionId: String(row.stripeSubscriptionId || row.stripe_subscription_id || ''),
    cancelAtPeriodEnd: Boolean(row.cancelAtPeriodEnd ?? row.cancel_at_period_end),
    currentPeriodEnd: row.currentPeriodEnd || row.current_period_end || null,
    source: String(row.source || ''),
    updatedAt: row.updatedAt || row.updated_at || null,
  };
}

async function upsertPatientBillingLocal(patientEmail, patch = {}) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return null;

  return mutateDb((db) => {
    const next = {
      patientEmail: normalizedEmail,
      hasActiveUnlimited: Boolean(patch.hasActiveUnlimited),
      plan: String(patch.plan || (patch.hasActiveUnlimited ? 'unlimited' : 'pay_as_you_go')),
      subscriptionStatus: String(patch.subscriptionStatus || (patch.hasActiveUnlimited ? 'active' : 'none')),
      stripeCustomerId: String(patch.stripeCustomerId || ''),
      stripeSubscriptionId: String(patch.stripeSubscriptionId || ''),
      cancelAtPeriodEnd: Boolean(patch.cancelAtPeriodEnd),
      currentPeriodEnd: patch.currentPeriodEnd ? String(patch.currentPeriodEnd) : null,
      source: String(patch.source || ''),
      updatedAt: new Date().toISOString(),
    };

    const index = db.patientBilling.findIndex(
      (entry) => normalizeEmail(entry?.patientEmail || entry?.patient_email) === normalizedEmail
    );
    if (index >= 0) {
      db.patientBilling[index] = next;
    } else {
      db.patientBilling.push(next);
    }
    return next;
  });
}

async function listCertificatesSupabase() {
  const rows = await supabaseRequest(
    'service_requests?select=*,medical_certificate_requests(*)&order=submitted_at.desc,created_at.desc'
  );
  return (rows || []).map(mapSupabaseRowToCertificate);
}

async function searchCertificatesByPatientNameSupabase(query, limit = 250, filters = null) {
  const normalizedQuery = String(query || '')
    .trim()
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
  if (normalizedQuery.length < 2) return [];
  const resolvedLimit = Math.min(500, Math.max(1, Number(limit || 250)));
  const queryParts = [
    'select=id,submitted_at,created_at,status,service_type,medical_certificate_requests!inner(patient_email,patient_full_name,days_requested)',
    `medical_certificate_requests.patient_full_name=ilike.${encodeURIComponent(`*${normalizedQuery}*`)}`,
  ];
  if (filters?.submittedAfter) {
    queryParts.push(`submitted_at=gte.${encodeURIComponent(filters.submittedAfter)}`);
  }
  if (filters?.submittedBefore) {
    queryParts.push(`submitted_at=lte.${encodeURIComponent(filters.submittedBefore)}`);
  }
  if (filters?.durationMin > 1) {
    queryParts.push(`medical_certificate_requests.days_requested=gte.${filters.durationMin}`);
  }
  if (filters?.durationMax < 7) {
    queryParts.push(`medical_certificate_requests.days_requested=lte.${filters.durationMax}`);
  }
  queryParts.push('order=submitted_at.desc,created_at.desc', `limit=${resolvedLimit}`);
  const rows = await supabaseRequest(`service_requests?${queryParts.join('&')}`);
  return (Array.isArray(rows) ? rows : []).map(mapSupabaseRowToCertificate);
}

function clampPatientCertificateLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 120;
  return Math.max(1, Math.min(500, Math.round(parsed)));
}

async function listCertificatesByPatientEmailSupabase(email, options = {}) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return [];

  const includeRawSubmission = options?.includeRawSubmission !== false;
  const limit = clampPatientCertificateLimit(options?.limit);
  let { medicalFields, serviceFields } = getSupabaseCertificateSelectFields(includeRawSubmission);
  if (medicalFields.length === 0 || serviceFields.length === 0) {
    return [];
  }

  let rows = [];
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const select = `${serviceFields.join(',')},medical_certificate_requests!inner(${medicalFields.join(',')})`;
    try {
      rows = await supabaseRequest(
        `service_requests?select=${select}&medical_certificate_requests.patient_email=eq.${encodeURIComponent(
          normalizedEmail
        )}&order=submitted_at.desc,created_at.desc&limit=${limit}`
      );
      break;
    } catch (errorObject) {
      const status = errorObject?.status;
      const code = errorObject?.data?.code;
      const missingColumn = extractMissingColumnName(errorObject?.data?.message || errorObject?.message);
      const isMissingColumnError =
        status === 400 &&
        Boolean(missingColumn) &&
        (code === 'PGRST204' || code === '42703' || String(errorObject?.message || '').toLowerCase().includes('does not exist'));

      if (isMissingColumnError) {
        const hadMedicalColumn = medicalFields.includes(missingColumn);
        const hadServiceColumn = serviceFields.includes(missingColumn);
        if (hadMedicalColumn) {
          medicalFields = medicalFields.filter((entry) => entry !== missingColumn);
        }
        if (hadServiceColumn) {
          serviceFields = serviceFields.filter((entry) => entry !== missingColumn);
        }

        const cachedMissingField = markSupabaseCertificateFieldMissing(missingColumn);
        if (hadMedicalColumn || hadServiceColumn || cachedMissingField) {
          if (medicalFields.length === 0 || serviceFields.length === 0) {
            rows = [];
            break;
          }
          continue;
        }
      }
      throw errorObject;
    }
  }
  return (rows || []).map(mapSupabaseRowToCertificate);
}

async function getCertificateByIdSupabase(id) {
  const rows = await supabaseRequest(
    `service_requests?select=*,medical_certificate_requests(*)&id=eq.${encodeURIComponent(id)}&limit=1`
  );
  if (!rows || rows.length === 0) return null;
  return mapSupabaseRowToCertificate(rows[0]);
}

function toMedicalInsert(certificate) {
  const draft = certificate.certificateDraft || {};
  const startDate = draft.startDate || new Date().toISOString().split('T')[0];
  const durationDays = Math.max(1, Number(draft.durationDays || 1));
  const endDate = new Date(`${startDate}T00:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + durationDays);

  return {
    request_id: certificate.id,
    patient_email: draft.email || '',
    patient_full_name: draft.fullName || '',
    patient_dob: draft.dob || null,
    patient_phone: draft.phone || null,
    patient_address: draft.address || null,
    symptoms: draft.symptom || null,
    symptom_onset_date: null,
    consult_reason: draft.description || null,
    work_or_study_context: draft.purpose || null,
    certificate_start_date: startDate,
    certificate_end_date: endDate.toISOString().split('T')[0],
    days_requested: durationDays,
    supporting_notes: draft.description || null,
    declaration_accepted: true,
    raw_submission: certificate.rawSubmission || null,
  };
}

function extractMissingColumnName(message) {
  const text = String(message || '');
  const match = text.match(/Could not find the '([^']+)' column/i);
  if (match) return match[1];

  // Postgres runtime error shape, e.g.:
  // "column medical_certificate_requests_1.patient_dob does not exist"
  const runtimeMatch = text.match(/column\s+([a-z0-9_]+\.)?([a-z0-9_]+)\s+does not exist/i);
  if (runtimeMatch?.[2]) return runtimeMatch[2];

  return null;
}

async function insertMedicalRequestResilient(payload) {
  const body = { ...payload };
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      await supabaseRequest('medical_certificate_requests', {
        method: 'POST',
        body,
      });
      return body;
    } catch (error) {
      const code = error?.data?.code;
      const status = error?.status;
      const missingColumn = extractMissingColumnName(error?.data?.message);
      if (status === 400 && code === 'PGRST204' && missingColumn && missingColumn in body) {
        delete body[missingColumn];
        continue;
      }
      throw error;
    }
  }

  throw new Error('Failed to insert medical certificate request after schema fallback attempts');
}

async function createPatientForSubmission(certificate) {
  const draft = certificate.certificateDraft || {};
  const patientEmail = normalizeEmail(draft.email || '');
  if (!patientEmail) {
    throw new Error('Patient email is required to create a linked auth user');
  }

  const fullName = String(draft.fullName || '').trim();
  const [firstName = '', ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(' ');
  let patientId = getCachedPatientId(patientEmail);
  let resolvedAuthUser = null;
  let reusedExistingAuthUser = false;

  if (!patientId) {
    try {
      const created = await supabaseAuthAdminRequest('users', {
        method: 'POST',
        body: {
          email: patientEmail,
          password: `Onya-${Date.now()}-Temp!`,
          email_confirm: true,
          user_metadata: { role: 'patient' },
        },
      });
      resolvedAuthUser = created?.user || created?.data?.user || created?.data || created || null;
      patientId = created?.user?.id || created?.id || created?.data?.user?.id || created?.data?.id || null;
    } catch (error) {
      const message = String(error?.message || '');
      const alreadyExists = message.includes('already') || message.includes('registered');
      if (!alreadyExists) {
        throw error;
      }

      const listed = await supabaseAuthAdminRequest('users?page=1&per_page=1000', {
        method: 'GET',
      });
      const allUsers = Array.isArray(listed)
        ? listed
        : Array.isArray(listed?.users)
        ? listed.users
        : Array.isArray(listed?.data?.users)
        ? listed.data.users
        : [];
      const match = allUsers.find((user) => normalizeEmail(user?.email) === patientEmail);
      resolvedAuthUser = match || null;
      patientId = match?.id || null;
      reusedExistingAuthUser = Boolean(match?.id);
    }
  }

  if (!patientId) {
    throw new Error('Failed to resolve patient auth user id');
  }

  let existingRole = String(
    resolvedAuthUser?.user_metadata?.role || resolvedAuthUser?.app_metadata?.role || ''
  )
    .trim()
    .toLowerCase();
  if (reusedExistingAuthUser) {
    const existingProfiles = await supabaseRequest(
      `profiles?id=eq.${encodeURIComponent(patientId)}&select=role&limit=1`,
      { method: 'GET' }
    );
    existingRole = String(existingProfiles?.[0]?.role || existingRole).trim().toLowerCase();
  }
  if (['provider', 'doctor', 'admin'].includes(existingRole)) {
    throw new Error('This email is assigned to a doctor or administrator account');
  }

  await supabaseRequest('profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: patientId,
      role: 'patient',
      first_name: firstName || null,
      last_name: lastName || null,
      phone: draft.phone || null,
      dob: draft.dob || null,
      created_at: certificate.createdAt || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  });

  await supabaseRequest('patients', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      id: patientId,
      owner_id: patientId,
      email: patientEmail || null,
      full_name: [firstName, lastName].filter(Boolean).join(' ') || null,
      phone: draft.phone || null,
      profile_photo_path: null,
      consent_telehealth: true,
      consent_marketing: false,
    },
  });

  setCachedPatientId(patientEmail, patientId);
  return patientId;
}

async function createCertificateSupabase(certificate) {
  const patientId = await createPatientForSubmission(certificate);

  const serviceInsert = {
    id: certificate.id,
    patient_id: patientId,
    service_type: certificate.serviceType || 'doctor',
    status: toSupabaseRequestStatus(certificate.status || 'submitted'),
    risk_score: certificate.risk?.score ?? 0,
    risk_level: toSupabaseRiskLevel(certificate.risk?.level),
    submitted_at: certificate.createdAt || new Date().toISOString(),
    created_at: certificate.createdAt || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const serviceRows = await supabaseRequest('service_requests', {
    method: 'POST',
    body: serviceInsert,
  });

  const insertedMedical = await insertMedicalRequestResilient(toMedicalInsert(certificate));

  return mapSupabaseRowToCertificate({
    ...serviceRows[0],
    medical_certificate_requests: insertedMedical,
  });
}

async function updateCertificateSupabase(id, updater) {
  const current = await getCertificateByIdSupabase(id);
  if (!current) return null;

  const updatedCandidate = updater(current);
  if (!updatedCandidate || updatedCandidate === current) {
    return current;
  }

  const updatePayload = {
    status: toSupabaseRequestStatus(updatedCandidate.status || current.status),
    updated_at: new Date().toISOString(),
  };

  const nextStatus = updatePayload.status;
  const decisionNotes = String(updatedCandidate.decision?.notes || '').trim();
  const isFinalDecision = nextStatus === 'approved' || nextStatus === 'denied';

  if (isFinalDecision && updatedCandidate.decision?.at) {
    updatePayload.reviewed_at = updatedCandidate.decision.at;
  }
  if (nextStatus === 'approved') {
    updatePayload.decision_reason = decisionNotes || null;
    updatePayload.denial_reason = null;
  }
  if (nextStatus === 'denied') {
    updatePayload.denial_reason = decisionNotes || null;
    updatePayload.decision_reason = null;
  }
  if (!isFinalDecision && decisionNotes) {
    updatePayload.decision_reason = decisionNotes;
  }

  const patchRows = await supabaseRequest(
    `service_requests?id=eq.${encodeURIComponent(id)}&status=eq.${encodeURIComponent(toSupabaseRequestStatus(current.status))}`,
    {
      method: 'PATCH',
      body: updatePayload,
    }
  );

  if (!patchRows || patchRows.length === 0) {
    return current;
  }

  const nextRawSubmission =
    updatedCandidate?.rawSubmission && typeof updatedCandidate.rawSubmission === 'object'
      ? updatedCandidate.rawSubmission
      : current.rawSubmission || null;
  if (nextRawSubmission) {
    try {
      await supabaseRequest(`medical_certificate_requests?request_id=eq.${encodeURIComponent(id)}`, {
        method: 'PATCH',
        body: {
          raw_submission: nextRawSubmission,
        },
      });
    } catch (errorObject) {
      warn('medical_request.raw_submission_patch_failed', {
        requestId: id,
        message: errorObject?.message || String(errorObject),
      });
    }
  }

  const refreshed = await getCertificateByIdSupabase(id);
  if (!refreshed) return null;
  refreshed.status = fromSupabaseRequestStatus(refreshed.status);
  return refreshed;
}

async function appendAuditSupabase(entry) {
  const requestId = entry.certificateId || entry.requestId || null;
  await supabaseRequest('request_events', {
    method: 'POST',
    body: {
      request_id: requestId,
      actor_user_id: null,
      event_type: entry.type || 'AUDIT_EVENT',
      payload: entry,
      created_at: new Date().toISOString(),
    },
  });
}

async function listCertificateMessagesSupabase(requestId) {
  const normalizedId = String(requestId || '').trim();
  if (!normalizedId) return [];

  const rows = await supabaseRequest(
    `request_events?request_id=eq.${encodeURIComponent(
      normalizedId
    )}&event_type=in.(PATIENT_MESSAGE_SENT,DOCTOR_MESSAGE_SENT,MORE_INFO_REQUESTED)&select=event_type,payload,created_at&order=created_at.asc&limit=100`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );

  return (Array.isArray(rows) ? rows : [])
    .map((entry, index) => mapCertificateMessageEvent(entry, index))
    .filter(Boolean);
}

async function getCertificateMessageSummariesSupabase(requestIds) {
  const normalizedIds = [
    ...new Set(
      (Array.isArray(requestIds) ? requestIds : [])
        .map((requestId) => String(requestId || '').trim())
        .filter(Boolean)
    ),
  ];
  if (normalizedIds.length === 0) return Object.create(null);

  const rows = [];
  const chunkSize = 100;
  const pageSize = 1000;

  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const chunk = normalizedIds.slice(index, index + chunkSize);
    const escaped = chunk.map((id) => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    const inFilter = `(${escaped.join(',')})`;

    for (let offset = 0; ; offset += pageSize) {
      const page = await supabaseRequest(
        `request_events?request_id=in.${encodeURIComponent(
          inFilter
        )}&event_type=in.(PATIENT_MESSAGE_SENT,DOCTOR_MESSAGE_SENT,MORE_INFO_REQUESTED)&select=request_id,event_type,payload,created_at&order=created_at.asc&limit=${pageSize}&offset=${offset}`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      );
      const pageRows = Array.isArray(page) ? page : [];
      rows.push(...pageRows);
      if (pageRows.length < pageSize) break;
    }
  }

  return buildCertificateMessageSummaries(rows);
}

async function resolveSupabasePatientIdByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const cachedPatientId = getCachedPatientId(normalizedEmail);
  if (cachedPatientId) return cachedPatientId;

  const rows = await supabaseRequest(
    `patients?email=eq.${encodeURIComponent(normalizedEmail)}&select=id&limit=1`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  const patientId = String(rows?.[0]?.id || '').trim();
  if (patientId) setCachedPatientId(normalizedEmail, patientId);
  return patientId || null;
}

async function getPatientClinicalProfileSupabase(email) {
  const patientId = await resolveSupabasePatientIdByEmail(email);
  if (!patientId) return normalizePatientClinicalProfileValue(null);

  const rows = await supabaseRequest(
    `patient_clinical_profiles?patient_id=eq.${encodeURIComponent(
      patientId
    )}&select=medical_history,allergies,medications,lifestyle_notes,test_results&limit=1`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return mapPatientClinicalProfileRow(rows?.[0] || null);
}

async function upsertPatientClinicalProfileSupabase(email, profile) {
  const patientId = await resolveSupabasePatientIdByEmail(email);
  if (!patientId) {
    const error = new Error('Patient profile was not found');
    error.code = 'PATIENT_NOT_FOUND';
    throw error;
  }

  const normalizedProfile = normalizePatientClinicalProfileValue(profile);
  const rows = await supabaseRequest('patient_clinical_profiles', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: {
      patient_id: patientId,
      medical_history: normalizedProfile.medicalHistory,
      allergies: normalizedProfile.allergies,
      medications: normalizedProfile.medications,
      lifestyle_notes: normalizedProfile.lifestyleNotes,
      test_results: normalizedProfile.testResults,
      updated_at: new Date().toISOString(),
    },
  });
  return mapPatientClinicalProfileRow(rows?.[0] || normalizedProfile);
}

async function searchPatientDirectorySupabase(query, limit = 20) {
  const normalizedQuery = String(query || '')
    .trim()
    .replace(/[%*(),]/g, ' ')
    .replace(/\s+/g, ' ')
    .slice(0, 100);
  if (normalizedQuery.length < 2) return [];
  const resolvedLimit = Math.min(50, Math.max(1, Number(limit || 20)));
  const rows = await supabaseRequest(
    `patients?full_name=ilike.${encodeURIComponent(
      `*${normalizedQuery}*`
    )}&select=id,email,full_name,phone,address&order=full_name.asc&limit=${resolvedLimit}`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return (Array.isArray(rows) ? rows : []).map(mapPatientDirectoryRow).filter(Boolean);
}

async function getPatientDirectoryEntryByIdSupabase(patientId) {
  const normalizedId = String(patientId || '').trim();
  if (!normalizedId) return null;
  const rows = await supabaseRequest(
    `patients?id=eq.${encodeURIComponent(
      normalizedId
    )}&select=id,email,full_name,phone,address&limit=1`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  const entry = mapPatientDirectoryRow(rows?.[0] || null);
  if (entry) setCachedPatientId(entry.email, entry.id);
  return entry;
}

function parsePatientMedicalRecordUpload({ fileName, fileDataUrl }) {
  const parsed = parseSupportedPatientMedicalRecordDataUri(fileDataUrl);
  if (!parsed) {
    const error = new Error('Upload a PDF, PNG, JPG, WEBP, HEIC, or HEIF file');
    error.code = 'FILE_TYPE_UNSUPPORTED';
    throw error;
  }
  const buffer = Buffer.from(parsed.body, 'base64');
  if (!buffer.length) {
    const error = new Error('The selected file is empty');
    error.code = 'FILE_EMPTY';
    throw error;
  }
  if (buffer.length > MAX_PATIENT_MEDICAL_RECORD_BYTES) {
    const maxMegabytes = (MAX_PATIENT_MEDICAL_RECORD_BYTES / 1_000_000).toFixed(1).replace(/\.0$/, '');
    const error = new Error(`The selected file must be ${maxMegabytes} MB or smaller`);
    error.code = 'FILE_TOO_LARGE';
    throw error;
  }
  return {
    buffer,
    mimeType: parsed.mime,
    extension: SUPPORTED_PATIENT_MEDICAL_RECORD_MIME_TO_EXTENSION[parsed.mime],
    fileName: truncateClinicalText(fileName, 255) || `medical-record.${SUPPORTED_PATIENT_MEDICAL_RECORD_MIME_TO_EXTENSION[parsed.mime]}`,
  };
}

async function uploadPatientMedicalRecordLocal({ email, fileName, fileDataUrl }) {
  const upload = parsePatientMedicalRecordUpload({ fileName, fileDataUrl });
  const patientHash = createHash('sha256').update(normalizeEmail(email)).digest('hex').slice(0, 20);
  const fileHash = createHash('sha256').update(upload.buffer).digest('hex').slice(0, 20);
  const safeName = normalizeStorageObjectPathSegment(path.parse(upload.fileName).name, 'medical-record');
  const relativePath = `patient-medical-records/${patientHash}/${Date.now()}-${fileHash}-${safeName}.${upload.extension}`;
  const absolutePath = path.resolve(DATA_DIR, relativePath);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, upload.buffer);
  return {
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    fileSize: upload.buffer.length,
    storagePath: relativePath,
  };
}

async function uploadPatientMedicalRecordSupabase({ email, fileName, fileDataUrl }) {
  const patientId = await resolveSupabasePatientIdByEmail(email);
  if (!patientId) {
    const error = new Error('Patient profile was not found');
    error.code = 'PATIENT_NOT_FOUND';
    throw error;
  }
  const upload = parsePatientMedicalRecordUpload({ fileName, fileDataUrl });
  const fileHash = createHash('sha256').update(upload.buffer).digest('hex').slice(0, 20);
  const safeName = normalizeStorageObjectPathSegment(path.parse(upload.fileName).name, 'medical-record');
  const objectPath = `patients/${patientId}/${Date.now()}-${fileHash}-${safeName}.${upload.extension}`;

  await uploadBufferToSupabaseStorage({
    config: getSupabaseConfig(),
    bucket: PATIENT_MEDICAL_RECORDS_BUCKET,
    objectPath,
    contentType: upload.mimeType,
    bodyBuffer: upload.buffer,
  });
  return {
    fileName: upload.fileName,
    mimeType: upload.mimeType,
    fileSize: upload.buffer.length,
    storagePath: objectPath,
  };
}

async function createPatientMedicalRecordDownloadLocal(email, recordId) {
  const profile = await getPatientClinicalProfileLocal(email);
  const record = profile.testResults.find((entry) => String(entry.id) === String(recordId));
  const storagePath = String(record?.storagePath || '').trim();
  if (!record || !storagePath.startsWith('patient-medical-records/')) return null;
  const absolutePath = path.resolve(DATA_DIR, storagePath);
  const allowedRoot = `${path.resolve(DATA_DIR, 'patient-medical-records')}${path.sep}`;
  if (!absolutePath.startsWith(allowedRoot)) return null;
  const buffer = await fs.readFile(absolutePath);
  return {
    url: `data:${record.mimeType || 'application/octet-stream'};base64,${buffer.toString('base64')}`,
    fileName: record.fileName || 'medical-record',
    mimeType: record.mimeType || 'application/octet-stream',
  };
}

async function createPatientMedicalRecordDownloadSupabase(email, recordId) {
  const profile = await getPatientClinicalProfileSupabase(email);
  const record = profile.testResults.find((entry) => String(entry.id) === String(recordId));
  const storagePath = String(record?.storagePath || '').trim();
  if (!record || !storagePath) return null;

  const config = getSupabaseConfig();
  const response = await fetch(
    `${config.url}/storage/v1/object/sign/${encodeURIComponent(PATIENT_MEDICAL_RECORDS_BUCKET)}/${storagePath
      .split('/')
      .map((part) => encodeURIComponent(part))
      .join('/')}`,
    {
      method: 'POST',
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ expiresIn: 300 }),
    }
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Medical record download failed (${response.status})`);
  }
  const signedPath = String(payload?.signedURL || payload?.signedUrl || '').trim();
  if (!signedPath) throw new Error('Medical record download URL was not returned');
  const url = /^https?:\/\//i.test(signedPath)
    ? signedPath
    : signedPath.startsWith('/storage/v1/')
    ? `${config.url}${signedPath}`
    : `${config.url}/storage/v1${signedPath.startsWith('/') ? '' : '/'}${signedPath}`;
  return {
    url,
    fileName: record.fileName || 'medical-record',
    mimeType: record.mimeType || 'application/octet-stream',
  };
}

async function getPatientBillingSupabase(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;

  const rows = await supabaseRequest(
    `patient_billing?patient_email=eq.${encodeURIComponent(normalizedEmail)}&select=*&limit=1`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return mapSupabaseRowToPatientBilling(row);
}

async function upsertPatientBillingSupabase(patientEmail, patch = {}) {
  const body = buildPatientBillingUpsertBody(patientEmail, patch);
  if (!body.patient_email) return null;

  const rows = await supabaseRequest('patient_billing', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body,
  });

  const row = Array.isArray(rows) ? rows[0] : null;
  return mapSupabaseRowToPatientBilling(row || body);
}

async function listMealPlannerRecipesSupabase() {
  const baseColumns = [
    'id',
    'title',
    'description',
    'image_url',
    'ingredients',
    'instructions',
    'calories',
    'protein',
    'carbs',
    'fat',
    'meal_type',
    'dietary_tags',
    'allergens',
    'prep_time_minutes',
    'cook_time_minutes',
    'total_time_minutes',
    'serves',
    'estimated_cost',
    'source',
    'is_active',
    'generated_by',
    'source_provider',
  ];
  let columns = [...baseColumns];
  let rows = [];
  let useIsActiveFilter = true;
  let useGeneratedByFilter = true;

  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      const queryFilters = [
        useIsActiveFilter ? 'is_active=eq.true' : '',
        useGeneratedByFilter ? 'generated_by=in.(openai,rules)' : '',
      ]
        .filter(Boolean)
        .join('&');
      const querySuffix = queryFilters ? `&${queryFilters}` : '';
      rows = await supabaseRequest(
        `meal_planner_recipes?select=${columns.join(',')}${querySuffix}&order=updated_at.desc&limit=1200`,
        {
          method: 'GET',
          prefer: 'return=representation',
        }
      );
      break;
    } catch (errorObject) {
      const status = errorObject?.status;
      const code = errorObject?.data?.code;
      const missingColumn = extractMissingColumnName(errorObject?.data?.message || errorObject?.message);
      if (status === 400 && code === 'PGRST204' && missingColumn) {
        if (missingColumn === 'generated_by') {
          useGeneratedByFilter = false;
        }
        if (missingColumn === 'is_active') {
          useIsActiveFilter = false;
        }
        if (columns.includes(missingColumn)) {
          columns = columns.filter((entry) => entry !== missingColumn);
        }
        continue;
      }
      throw errorObject;
    }
  }

  if (!Array.isArray(rows) || rows.length === 0) {
    try {
      rows = await supabaseRequest('meal_planner_recipes?select=*&order=updated_at.desc&limit=1400', {
        method: 'GET',
        prefer: 'return=representation',
      });
    } catch {
      // Ignore and keep previous rows value for downstream filtering.
    }
  }

  const recipes = Array.isArray(rows) ? rows.map(mapRecipeRecordToMealPlannerRecipe) : [];
  const normalizedRecipes = recipes
    .filter((recipe) => recipe.id && recipe.title && Array.isArray(recipe.ingredients))
    .filter((recipe) => isMealPlannerRecipeEligible(recipe));
  for (const recipe of normalizedRecipes) {
    setCachedSupabaseMealPlannerRecipeById(recipe);
  }
  return normalizedRecipes;
}

async function listMealPlannerRecipesByIdsSupabase(recipeIds = []) {
  const normalizedIds = normalizeRecipeIdList(recipeIds, 1200);
  if (normalizedIds.length === 0) return [];
  const byId = new Map();
  const missingIds = [];
  for (const recipeId of normalizedIds) {
    const cachedRecipe = getCachedSupabaseMealPlannerRecipeById(recipeId);
    if (cachedRecipe && isMealPlannerRecipeEligible(cachedRecipe)) {
      byId.set(recipeId, cachedRecipe);
    } else if (cachedRecipe && !isMealPlannerRecipeEligible(cachedRecipe)) {
      supabaseMealPlannerRecipeByIdCache.delete(recipeId);
    } else {
      missingIds.push(recipeId);
    }
  }

  if (missingIds.length > 0) {
    const chunkSize = 120;
    for (let index = 0; index < missingIds.length; index += chunkSize) {
      const chunk = missingIds.slice(index, index + chunkSize);
      if (chunk.length === 0) continue;
      const escaped = chunk.map((id) => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
      const inFilter = `(${escaped.join(',')})`;
      let useIsActiveFilter = true;
      let useGeneratedByFilter = true;
      let rows = [];

      for (let attempt = 0; attempt < 6; attempt += 1) {
        try {
          const queryFilters = [
            `id=in.${encodeURIComponent(inFilter)}`,
            useIsActiveFilter ? 'is_active=eq.true' : '',
            useGeneratedByFilter ? 'generated_by=in.(openai,rules)' : '',
            `limit=${Math.max(chunk.length, 1)}`,
          ]
            .filter(Boolean)
            .join('&');
          rows = await supabaseRequest(`meal_planner_recipes?select=*&${queryFilters}`, {
            method: 'GET',
            prefer: 'return=representation',
          });
          break;
        } catch (errorObject) {
          const status = errorObject?.status;
          const code = errorObject?.data?.code;
          const missingColumn = extractMissingColumnName(errorObject?.data?.message || errorObject?.message);
          if (status === 400 && code === 'PGRST204' && missingColumn) {
            if (missingColumn === 'generated_by') useGeneratedByFilter = false;
            if (missingColumn === 'is_active') useIsActiveFilter = false;
            continue;
          }
          throw errorObject;
        }
      }

      const fetchedRecipes = Array.isArray(rows) ? rows.map(mapRecipeRecordToMealPlannerRecipe) : [];
      for (const recipe of fetchedRecipes) {
        if (!recipe?.id || !isMealPlannerRecipeEligible(recipe)) continue;
        byId.set(recipe.id, recipe);
        setCachedSupabaseMealPlannerRecipeById(recipe);
      }
    }
  }

  return normalizedIds.map((id) => byId.get(id)).filter(Boolean);
}

async function listMealPlannerRecipesLocal() {
  if (!ENABLE_LOCAL_LEGACY_RECIPE_FALLBACK) {
    if (!localLegacyRecipeFallbackWarningLogged) {
      warn('meal_planner_recipes.local_fallback_disabled');
      localLegacyRecipeFallbackWarningLogged = true;
    }
    cachedLocalMealPlannerRecipes = [];
    return [];
  }

  if (Array.isArray(cachedLocalMealPlannerRecipes) && cachedLocalMealPlannerRecipes.length > 0) {
    return cachedLocalMealPlannerRecipes;
  }

  try {
    const raw = await fs.readFile(LOCAL_MEAL_PLANNER_RECIPES_PATH, 'utf8');
    const payload = JSON.parse(raw || '{}');
    const recipesRaw = Array.isArray(payload?.recipes) ? payload.recipes : [];
    const recipes = recipesRaw
      .map((row) => mapRecipeRecordToMealPlannerRecipe(row))
      .filter((recipe) => recipe.id && recipe.title && Array.isArray(recipe.ingredients));
    cachedLocalMealPlannerRecipes = recipes;
    return recipes;
  } catch (error) {
    warn('meal_planner_recipes.local_read_failed', {
      path: LOCAL_MEAL_PLANNER_RECIPES_PATH,
      message: error?.message || String(error),
    });
    cachedLocalMealPlannerRecipes = [];
    return [];
  }
}

async function listMealPlannerRecipesByIdsLocal(recipeIds = []) {
  const normalizedIds = normalizeRecipeIdList(recipeIds);
  if (normalizedIds.length === 0) return [];
  const recipes = await listMealPlannerRecipesLocal();
  const byId = new Map(recipes.filter((recipe) => recipe.id).map((recipe) => [recipe.id, recipe]));
  return normalizedIds.map((id) => byId.get(id)).filter(Boolean);
}

function resolveImageFromSourceRecord(sourceRecord = {}) {
  if (!sourceRecord || typeof sourceRecord !== 'object' || Array.isArray(sourceRecord)) return '';
  return String(sourceRecord.image_url || sourceRecord.imageUrl || '').trim();
}

async function listMealPlannerRecipeImageByIdsSupabase(recipeIds = []) {
  const normalizedIds = normalizeRecipeIdList(recipeIds, 1200);
  if (normalizedIds.length === 0) return new Map();

  const results = new Map();
  const chunkSize = 120;
  for (let index = 0; index < normalizedIds.length; index += chunkSize) {
    const chunk = normalizedIds.slice(index, index + chunkSize);
    if (chunk.length === 0) continue;
    const escaped = chunk.map((id) => `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
    const inFilter = `(${escaped.join(',')})`;
    const rows = await supabaseRequest(
      `meal_planner_recipes?select=id,image_url,source&id=in.${encodeURIComponent(inFilter)}&limit=${Math.max(
        chunk.length,
        1
      )}`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    ).catch(() => []);

    for (const row of Array.isArray(rows) ? rows : []) {
      const id = String(row?.id || '').trim();
      if (!id) continue;
      const source = row?.source && typeof row.source === 'object' && !Array.isArray(row.source) ? row.source : {};
      const imageUrl = String(row?.image_url || resolveImageFromSourceRecord(source) || '').trim();
      if (!imageUrl) continue;
      results.set(id, imageUrl);
    }
  }

  return results;
}

async function upsertMealPlannerRecipesSupabase(recipes = []) {
  let rows = Array.isArray(recipes)
    ? recipes
        .map((recipe) => mapMealPlannerRecipeToSupabaseRecord(recipe))
        .filter((row) => row && row.id && row.title)
    : [];
  if (rows.length === 0) return 0;

  const existingImagesById = await listMealPlannerRecipeImageByIdsSupabase(rows.map((row) => row.id)).catch(() => new Map());

  for (const row of rows) {
    const sourceRecord =
      row?.source && typeof row.source === 'object' && !Array.isArray(row.source)
        ? { ...row.source }
        : {};
    let nextImageUrl = String(row?.image_url || row?.imageUrl || resolveImageFromSourceRecord(sourceRecord) || '').trim();

    if (nextImageUrl) {
      try {
        const uploadedImageUrl = await persistRecipeImageDataUriToStorage(row, sourceRecord);
        if (uploadedImageUrl) nextImageUrl = uploadedImageUrl;
      } catch (errorObject) {
        warn('meal_planner_recipes.image_storage_upload_failed', {
          recipeId: String(row?.id || '').trim(),
          message: errorObject?.message || String(errorObject),
        });
      }
    }

    if (!nextImageUrl) {
      const existingImageUrl = String(existingImagesById.get(String(row?.id || '').trim()) || '').trim();
      if (existingImageUrl) nextImageUrl = existingImageUrl;
    }

    if (nextImageUrl) {
      row.image_url = nextImageUrl;
      sourceRecord.image_url = nextImageUrl;
      sourceRecord.imageUrl = nextImageUrl;
    } else {
      delete row.image_url;
      delete sourceRecord.image_url;
      delete sourceRecord.imageUrl;
    }
    row.source = sourceRecord;
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    try {
      await supabaseRequest('meal_planner_recipes', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates,return=minimal',
        body: rows,
      });
      const cachedRecipes = rows
        .map((row) => mapRecipeRecordToMealPlannerRecipe(row))
        .filter((recipe) => recipe?.id && recipe?.title && Array.isArray(recipe?.ingredients));
      for (const recipe of cachedRecipes) {
        setCachedSupabaseMealPlannerRecipeById(recipe);
      }
      return rows.length;
    } catch (errorObject) {
      const status = errorObject?.status;
      const code = errorObject?.data?.code;
      const missingColumn = extractMissingColumnName(errorObject?.data?.message || errorObject?.message);
      if (status === 400 && code === 'PGRST204' && missingColumn) {
        rows = rows.map((row) => {
          const next = { ...row };
          delete next[missingColumn];
          return next;
        });
        continue;
      }
      throw errorObject;
    }
  }

  return rows.length;
}

async function upsertMealPlannerRecipesLocal(_recipes = []) {
  return 0;
}

async function getMealPlanGenerationCacheFromRequestEventsSupabase(cacheKey) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  if (!normalizedKey) return null;

  const mapEventRows = (rows) => {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null;
      if (!payload) continue;
      const payloadKey = sanitizeMealPlanCacheKey(payload.cacheKey || payload.cache_key);
      if (payloadKey !== normalizedKey) continue;
      const mapped = mapMealPlanGenerationCacheRow({
        cache_key: payload.cacheKey || payload.cache_key || normalizedKey,
        intake_hash: payload.intakeHash || payload.intake_hash,
        patient_email: payload.patientEmail || payload.patient_email,
        source: payload.source || 'openai',
        stage: payload.stage || 'ai_recipes_v2',
        bundle: payload.bundle,
        created_at: payload.createdAt || payload.created_at || row?.created_at || null,
        updated_at: payload.updatedAt || payload.updated_at || row?.created_at || null,
        last_used_at: payload.lastUsedAt || payload.last_used_at || row?.created_at || null,
      });
      if (mapped) return mapped;
    }
    return null;
  };

  try {
    const rows = await supabaseRequest(
      `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
        MEAL_PLAN_CACHE_EVENT_TYPE
      )}&payload->>cacheKey=eq.${encodeURIComponent(normalizedKey)}&order=created_at.desc&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mapped = mapEventRows(rows);
    if (mapped) return mapped;
  } catch (errorObject) {
    warn('meal_plan_generation_cache.event_query_filtered_failed', {
      cacheKey: normalizedKey,
      message: errorObject?.message || String(errorObject),
    });
  }

  const rows = await supabaseRequest(
    `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
      MEAL_PLAN_CACHE_EVENT_TYPE
    )}&order=created_at.desc&limit=400`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return mapEventRows(rows);
}

async function getMealPlanTemplateCacheByIntakeHashFromRequestEventsSupabase(intakeHash) {
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  if (!normalizedHash) return null;

  const mapEventRows = (rows) => {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null;
      if (!payload) continue;
      const payloadHash = sanitizeMealPlanIntakeHash(payload.intakeHash || payload.intake_hash);
      if (payloadHash !== normalizedHash) continue;
      const mapped = mapMealPlanGenerationCacheRow({
        cache_key: payload.cacheKey || payload.cache_key || `mealplan:template:${normalizedHash}`,
        intake_hash: payload.intakeHash || payload.intake_hash || normalizedHash,
        patient_email: payload.patientEmail || payload.patient_email || SHARED_MEAL_PLAN_TEMPLATE_EMAIL,
        source: payload.source || 'openai',
        stage: payload.stage || 'ai_recipes_v2',
        bundle: payload.bundle,
        created_at: payload.createdAt || payload.created_at || row?.created_at || null,
        updated_at: payload.updatedAt || payload.updated_at || row?.created_at || null,
        last_used_at: payload.lastUsedAt || payload.last_used_at || row?.created_at || null,
      });
      if (mapped) return mapped;
    }
    return null;
  };

  try {
    const rows = await supabaseRequest(
      `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
        MEAL_PLAN_CACHE_EVENT_TYPE
      )}&payload->>intakeHash=eq.${encodeURIComponent(normalizedHash)}&order=created_at.desc&limit=8`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mapped = mapEventRows(rows);
    if (mapped) return mapped;
  } catch (errorObject) {
    warn('meal_plan_generation_cache.event_template_filtered_failed', {
      intakeHash: normalizedHash,
      message: errorObject?.message || String(errorObject),
    });
  }

  const rows = await supabaseRequest(
    `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
      MEAL_PLAN_CACHE_EVENT_TYPE
    )}&order=created_at.desc&limit=600`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return mapEventRows(rows);
}

async function upsertMealPlanGenerationCacheToRequestEventsSupabase({
  cacheKey,
  intakeHash,
  patientEmail,
  source = 'openai',
  stage = 'ai_recipes_v2',
  bundle,
}) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  const normalizedEmail = normalizeEmail(patientEmail);
  const normalizedBundle = normalizeMealPlanGenerationBundle(bundle);
  if (!normalizedKey || !normalizedHash || !normalizedEmail || !normalizedBundle) return null;

  const now = new Date().toISOString();
  await supabaseRequest('request_events', {
    method: 'POST',
    body: {
      request_id: null,
      actor_user_id: null,
      event_type: MEAL_PLAN_CACHE_EVENT_TYPE,
      payload: {
        cacheKey: normalizedKey,
        intakeHash: normalizedHash,
        patientEmail: normalizedEmail,
        source: String(source || 'openai').trim() || 'openai',
        stage: String(stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2',
        bundle: normalizedBundle,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
      },
      created_at: now,
    },
  });

  return {
    cacheKey: normalizedKey,
    intakeHash: normalizedHash,
    patientEmail: normalizedEmail,
    source: String(source || 'openai').trim() || 'openai',
    stage: String(stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2',
    bundle: normalizedBundle,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  };
}

async function getMealPlanGenerationCacheSupabase(cacheKey) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  if (!normalizedKey) return null;

  try {
    const rows = await supabaseRequest(
      `meal_plan_generation_cache?cache_key=eq.${encodeURIComponent(normalizedKey)}&select=*&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    const mapped = mapMealPlanGenerationCacheRow(row);
    if (!mapped) return null;

    void supabaseRequest(`meal_plan_generation_cache?cache_key=eq.${encodeURIComponent(normalizedKey)}`, {
      method: 'PATCH',
      prefer: 'return=minimal',
      body: {
        last_used_at: new Date().toISOString(),
      },
    }).catch((errorObject) => {
      warn('meal_plan_generation_cache.supabase_touch_failed', {
        cacheKey: normalizedKey,
        message: errorObject?.message || String(errorObject),
      });
    });

    return mapped;
  } catch (errorObject) {
    if (!shouldFallbackMealPlanCacheToRequestEvents(errorObject)) {
      throw errorObject;
    }
    return getMealPlanGenerationCacheFromRequestEventsSupabase(normalizedKey);
  }
}

async function getMealPlanTemplateCacheByIntakeHashSupabase(intakeHash) {
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  if (!normalizedHash) return null;

  try {
    const rows = await supabaseRequest(
      `meal_plan_generation_cache?intake_hash=eq.${encodeURIComponent(
        normalizedHash
      )}&select=*&order=last_used_at.desc&limit=12`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const candidateRows = Array.isArray(rows) ? rows : [];
    const row =
      candidateRows.find((entry) =>
        sanitizeMealPlanCacheKey(entry?.cache_key || entry?.cacheKey).includes(':template:')
      ) || candidateRows[0] || null;
    const mapped = mapMealPlanGenerationCacheRow(row);
    if (!mapped) return null;
    void supabaseRequest(
      `meal_plan_generation_cache?cache_key=eq.${encodeURIComponent(mapped.cacheKey)}`,
      {
        method: 'PATCH',
        prefer: 'return=minimal',
        body: {
          last_used_at: new Date().toISOString(),
        },
      }
    ).catch((errorObject) => {
      warn('meal_plan_generation_cache.supabase_template_touch_failed', {
        intakeHash: normalizedHash,
        message: errorObject?.message || String(errorObject),
      });
    });
    return mapped;
  } catch (errorObject) {
    if (!shouldFallbackMealPlanCacheToRequestEvents(errorObject)) {
      throw errorObject;
    }
    return getMealPlanTemplateCacheByIntakeHashFromRequestEventsSupabase(normalizedHash);
  }
}

async function upsertMealPlanGenerationCacheSupabase({
  cacheKey,
  intakeHash,
  patientEmail,
  source = 'openai',
  stage = 'ai_recipes_v2',
  bundle,
}) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  const normalizedEmail = normalizeEmail(patientEmail);
  const normalizedBundle = normalizeMealPlanGenerationBundle(bundle);
  if (!normalizedKey || !normalizedHash || !normalizedEmail || !normalizedBundle) return null;

  const now = new Date().toISOString();
  try {
    const rows = await supabaseRequest('meal_plan_generation_cache', {
      method: 'POST',
      prefer: 'resolution=merge-duplicates,return=representation',
      body: {
        cache_key: normalizedKey,
        patient_email: normalizedEmail,
        intake_hash: normalizedHash,
        source: String(source || 'openai').trim() || 'openai',
        stage: String(stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2',
        bundle: normalizedBundle,
        updated_at: now,
        last_used_at: now,
      },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    const mapped = mapMealPlanGenerationCacheRow(row);
    if (mapped) return mapped;
  } catch (errorObject) {
    if (!shouldFallbackMealPlanCacheToRequestEvents(errorObject)) {
      throw errorObject;
    }
    return upsertMealPlanGenerationCacheToRequestEventsSupabase({
      cacheKey: normalizedKey,
      intakeHash: normalizedHash,
      patientEmail: normalizedEmail,
      source,
      stage,
      bundle: normalizedBundle,
    });
  }
  return {
    cacheKey: normalizedKey,
    intakeHash: normalizedHash,
    patientEmail: normalizedEmail,
    source: String(source || 'openai').trim() || 'openai',
    stage: String(stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2',
    bundle: normalizedBundle,
    createdAt: now,
    updatedAt: now,
    lastUsedAt: now,
  };
}

async function getMealPlanGenerationCacheLocal(cacheKey) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  if (!normalizedKey) return null;

  const db = await readDbRaw();
  const row = Array.isArray(db.mealPlanGenerationCache)
    ? db.mealPlanGenerationCache.find((entry) => sanitizeMealPlanCacheKey(entry?.cacheKey || entry?.cache_key) === normalizedKey)
    : null;
  const mapped = mapMealPlanGenerationCacheRow(row);
  if (!mapped) return null;

  void mutateDb((nextDb) => {
    const entries = Array.isArray(nextDb.mealPlanGenerationCache) ? nextDb.mealPlanGenerationCache : [];
    const index = entries.findIndex((entry) => sanitizeMealPlanCacheKey(entry?.cacheKey || entry?.cache_key) === normalizedKey);
    if (index >= 0) {
      entries[index] = {
        ...entries[index],
        lastUsedAt: new Date().toISOString(),
      };
      nextDb.mealPlanGenerationCache = entries;
    }
  }).catch(() => undefined);

  return mapped;
}

async function getMealPlanTemplateCacheByIntakeHashLocal(intakeHash) {
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  if (!normalizedHash) return null;

  const db = await readDbRaw();
  const entries = Array.isArray(db.mealPlanGenerationCache) ? db.mealPlanGenerationCache : [];
  const matching = entries
    .filter((entry) => sanitizeMealPlanIntakeHash(entry?.intakeHash || entry?.intake_hash) === normalizedHash)
    .sort((left, right) =>
      String(right?.lastUsedAt || right?.last_used_at || right?.updatedAt || right?.updated_at || '').localeCompare(
        String(left?.lastUsedAt || left?.last_used_at || left?.updatedAt || left?.updated_at || '')
      )
    );
  const row =
    matching.find((entry) =>
      sanitizeMealPlanCacheKey(entry?.cacheKey || entry?.cache_key).includes(':template:')
    ) || matching[0] || null;
  const mapped = mapMealPlanGenerationCacheRow(row);
  if (!mapped) return null;
  return mapped;
}

async function getLatestMealPlanGenerationCacheByPatientEmailFromRequestEventsSupabase(patientEmail) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return null;

  const mapEventRows = (rows) => {
    if (!Array.isArray(rows)) return null;
    for (const row of rows) {
      const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null;
      if (!payload) continue;
      const payloadEmail = normalizeEmail(payload.patientEmail || payload.patient_email);
      if (payloadEmail !== normalizedEmail) continue;
      const mapped = mapMealPlanGenerationCacheRow({
        cache_key: payload.cacheKey || payload.cache_key || '',
        intake_hash: payload.intakeHash || payload.intake_hash,
        patient_email: payload.patientEmail || payload.patient_email || normalizedEmail,
        source: payload.source || 'openai',
        stage: payload.stage || 'ai_recipes_v2',
        bundle: payload.bundle,
        created_at: payload.createdAt || payload.created_at || row?.created_at || null,
        updated_at: payload.updatedAt || payload.updated_at || row?.created_at || null,
        last_used_at: payload.lastUsedAt || payload.last_used_at || row?.created_at || null,
      });
      if (!mapped) continue;
      if (mapped.patientEmail === SHARED_MEAL_PLAN_TEMPLATE_EMAIL) continue;
      if (mapped.cacheKey.includes(':template:')) continue;
      return mapped;
    }
    return null;
  };

  try {
    const rows = await supabaseRequest(
      `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
        MEAL_PLAN_CACHE_EVENT_TYPE
      )}&payload->>patientEmail=eq.${encodeURIComponent(normalizedEmail)}&order=created_at.desc&limit=24`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mapped = mapEventRows(rows);
    if (mapped) return mapped;
  } catch (errorObject) {
    warn('meal_plan_generation_cache.event_latest_patient_filtered_failed', {
      patientEmail: normalizedEmail,
      message: errorObject?.message || String(errorObject),
    });
  }

  const rows = await supabaseRequest(
    `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
      MEAL_PLAN_CACHE_EVENT_TYPE
    )}&order=created_at.desc&limit=900`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return mapEventRows(rows);
}

async function getLatestMealPlanGenerationCacheByPatientEmailSupabase(patientEmail) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return null;

  try {
    const rows = await supabaseRequest(
      `meal_plan_generation_cache?patient_email=eq.${encodeURIComponent(
        normalizedEmail
      )}&select=*&order=updated_at.desc&limit=1`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mappedRows = (Array.isArray(rows) ? rows : [])
      .map((row) => mapMealPlanGenerationCacheRow(row))
      .filter((entry) => entry && entry.patientEmail !== SHARED_MEAL_PLAN_TEMPLATE_EMAIL && !entry.cacheKey.includes(':template:'));
    if (mappedRows.length > 0) {
      return mappedRows[0];
    }
  } catch (errorObject) {
    if (!shouldFallbackMealPlanCacheToRequestEvents(errorObject)) {
      throw errorObject;
    }
    return getLatestMealPlanGenerationCacheByPatientEmailFromRequestEventsSupabase(normalizedEmail);
  }

  return getLatestMealPlanGenerationCacheByPatientEmailFromRequestEventsSupabase(normalizedEmail);
}

async function listMealPlanGenerationCacheByPatientEmailSupabase(patientEmail, limit = 24) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return [];
  const boundedLimit = Math.max(1, Math.min(720, Number(limit || 24)));

  const mapRows = (rows) =>
    (Array.isArray(rows) ? rows : [])
      .map((row) => mapMealPlanGenerationCacheRow(row))
      .filter((entry) => entry && entry.patientEmail === normalizedEmail && !entry.cacheKey.includes(':template:'));

  try {
    const rows = await supabaseRequest(
      `meal_plan_generation_cache?patient_email=eq.${encodeURIComponent(
        normalizedEmail
      )}&select=*&order=updated_at.desc&limit=${boundedLimit}`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mapped = mapRows(rows);
    if (mapped.length > 0) return mapped;
  } catch (errorObject) {
    if (!shouldFallbackMealPlanCacheToRequestEvents(errorObject)) {
      throw errorObject;
    }
  }

  const mapEventRows = (rows) => {
    const mapped = [];
    if (!Array.isArray(rows)) return mapped;
    for (const row of rows) {
      const payload = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : null;
      if (!payload) continue;
      const payloadEmail = normalizeEmail(payload.patientEmail || payload.patient_email);
      if (payloadEmail !== normalizedEmail) continue;
      const candidate = mapMealPlanGenerationCacheRow({
        cache_key: payload.cacheKey || payload.cache_key || '',
        intake_hash: payload.intakeHash || payload.intake_hash,
        patient_email: payload.patientEmail || payload.patient_email || normalizedEmail,
        source: payload.source || 'openai',
        stage: payload.stage || 'ai_recipes_v2',
        bundle: payload.bundle,
        created_at: payload.createdAt || payload.created_at || row?.created_at || null,
        updated_at: payload.updatedAt || payload.updated_at || row?.created_at || null,
        last_used_at: payload.lastUsedAt || payload.last_used_at || row?.created_at || null,
      });
      if (!candidate) continue;
      if (candidate.patientEmail === SHARED_MEAL_PLAN_TEMPLATE_EMAIL || candidate.cacheKey.includes(':template:')) continue;
      mapped.push(candidate);
      if (mapped.length >= boundedLimit) break;
    }
    return mapped;
  };

  try {
    const rows = await supabaseRequest(
      `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
        MEAL_PLAN_CACHE_EVENT_TYPE
      )}&payload->>patientEmail=eq.${encodeURIComponent(normalizedEmail)}&order=created_at.desc&limit=${Math.max(
        boundedLimit * 2,
        24
      )}`,
      {
        method: 'GET',
        prefer: 'return=representation',
      }
    );
    const mapped = mapEventRows(rows);
    if (mapped.length > 0) return mapped;
  } catch (errorObject) {
    warn('meal_plan_generation_cache.event_list_patient_filtered_failed', {
      patientEmail: normalizedEmail,
      message: errorObject?.message || String(errorObject),
    });
  }

  const rows = await supabaseRequest(
    `request_events?select=payload,created_at&event_type=eq.${encodeURIComponent(
      MEAL_PLAN_CACHE_EVENT_TYPE
    )}&order=created_at.desc&limit=900`,
    {
      method: 'GET',
      prefer: 'return=representation',
    }
  );
  return mapEventRows(rows);
}

async function getLatestMealPlanGenerationCacheByPatientEmailLocal(patientEmail) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return null;

  const db = await readDbRaw();
  const entries = Array.isArray(db.mealPlanGenerationCache) ? db.mealPlanGenerationCache : [];
  const sorted = entries
    .map((entry) => mapMealPlanGenerationCacheRow(entry))
    .filter(
      (entry) =>
        entry &&
        entry.patientEmail === normalizedEmail &&
        entry.patientEmail !== SHARED_MEAL_PLAN_TEMPLATE_EMAIL &&
        !entry.cacheKey.includes(':template:')
    )
    .sort((left, right) =>
      String(right?.updatedAt || right?.lastUsedAt || right?.createdAt || '').localeCompare(
        String(left?.updatedAt || left?.lastUsedAt || left?.createdAt || '')
      )
    );
  return sorted[0] || null;
}

async function listMealPlanGenerationCacheByPatientEmailLocal(patientEmail, limit = 24) {
  const normalizedEmail = normalizeEmail(patientEmail);
  if (!normalizedEmail) return [];
  const boundedLimit = Math.max(1, Math.min(720, Number(limit || 24)));

  const db = await readDbRaw();
  const entries = Array.isArray(db.mealPlanGenerationCache) ? db.mealPlanGenerationCache : [];
  const sorted = entries
    .map((entry) => mapMealPlanGenerationCacheRow(entry))
    .filter(
      (entry) =>
        entry &&
        entry.patientEmail === normalizedEmail &&
        entry.patientEmail !== SHARED_MEAL_PLAN_TEMPLATE_EMAIL &&
        !entry.cacheKey.includes(':template:')
    )
    .sort((left, right) =>
      String(right?.updatedAt || right?.lastUsedAt || right?.createdAt || '').localeCompare(
        String(left?.updatedAt || left?.lastUsedAt || left?.createdAt || '')
      )
    );
  return sorted.slice(0, boundedLimit);
}

async function upsertMealPlanGenerationCacheLocal({
  cacheKey,
  intakeHash,
  patientEmail,
  source = 'openai',
  stage = 'ai_recipes_v2',
  bundle,
}) {
  const normalizedKey = sanitizeMealPlanCacheKey(cacheKey);
  const normalizedHash = sanitizeMealPlanIntakeHash(intakeHash);
  const normalizedEmail = normalizeEmail(patientEmail);
  const normalizedBundle = normalizeMealPlanGenerationBundle(bundle);
  if (!normalizedKey || !normalizedHash || !normalizedEmail || !normalizedBundle) return null;

  return mutateDb((db) => {
    const entries = Array.isArray(db.mealPlanGenerationCache) ? db.mealPlanGenerationCache : [];
    const now = new Date().toISOString();
    const index = entries.findIndex((entry) => sanitizeMealPlanCacheKey(entry?.cacheKey || entry?.cache_key) === normalizedKey);
    const nextEntry = {
      cacheKey: normalizedKey,
      intakeHash: normalizedHash,
      patientEmail: normalizedEmail,
      source: String(source || 'openai').trim() || 'openai',
      stage: String(stage || 'ai_recipes_v2').trim() || 'ai_recipes_v2',
      bundle: normalizedBundle,
      updatedAt: now,
      lastUsedAt: now,
      createdAt: index >= 0 ? entries[index]?.createdAt || entries[index]?.created_at || now : now,
    };

    if (index >= 0) {
      entries[index] = nextEntry;
    } else {
      entries.push(nextEntry);
    }

    entries.sort((a, b) =>
      String(b?.updatedAt || b?.updated_at || '').localeCompare(String(a?.updatedAt || a?.updated_at || ''))
    );
    if (entries.length > LOCAL_MEAL_PLAN_CACHE_MAX_ENTRIES) {
      entries.length = LOCAL_MEAL_PLAN_CACHE_MAX_ENTRIES;
    }
    db.mealPlanGenerationCache = entries;
    return nextEntry;
  });
}

export async function listCertificates() {
  if (getSupabaseConfig().enabled) {
    return listCertificatesSupabase();
  }
  return listCertificatesLocal();
}

export async function listCertificatesByPatientEmail(email, options = {}) {
  if (getSupabaseConfig().enabled) {
    return listCertificatesByPatientEmailSupabase(email, options);
  }
  return listCertificatesByPatientEmailLocal(email);
}

export async function searchCertificatesByPatientName(query, limit = 250, filters = null) {
  if (getSupabaseConfig().enabled) {
    return searchCertificatesByPatientNameSupabase(query, limit, filters);
  }
  return searchCertificatesByPatientNameLocal(query, limit, filters);
}

export async function getCertificateById(id) {
  if (getSupabaseConfig().enabled) {
    return getCertificateByIdSupabase(id);
  }
  return getCertificateByIdLocal(id);
}

export async function createCertificate(certificate) {
  if (getSupabaseConfig().enabled) {
    return createCertificateSupabase(certificate);
  }
  return createCertificateLocal(certificate);
}

export async function updateCertificate(id, updater) {
  if (getSupabaseConfig().enabled) {
    return updateCertificateSupabase(id, updater);
  }
  return updateCertificateLocal(id, updater);
}

export async function appendAudit(entry) {
  if (getSupabaseConfig().enabled) {
    return appendAuditSupabase(entry);
  }
  return appendAuditLocal(entry);
}

export async function listCertificateMessages(requestId) {
  if (getSupabaseConfig().enabled) {
    return listCertificateMessagesSupabase(requestId);
  }
  return listCertificateMessagesLocal(requestId);
}

export async function getCertificateMessageSummaries(requestIds) {
  if (getSupabaseConfig().enabled) {
    return getCertificateMessageSummariesSupabase(requestIds);
  }
  return getCertificateMessageSummariesLocal(requestIds);
}

export function normalizePatientClinicalProfile(profile) {
  return normalizePatientClinicalProfileValue(profile);
}

export async function getPatientClinicalProfileByEmail(email) {
  if (getSupabaseConfig().enabled) {
    return getPatientClinicalProfileSupabase(email);
  }
  return getPatientClinicalProfileLocal(email);
}

export async function upsertPatientClinicalProfileByEmail(email, profile) {
  if (getSupabaseConfig().enabled) {
    return upsertPatientClinicalProfileSupabase(email, profile);
  }
  return upsertPatientClinicalProfileLocal(email, profile);
}

export async function searchPatientDirectory(query, limit = 20) {
  if (getSupabaseConfig().enabled) {
    return searchPatientDirectorySupabase(query, limit);
  }
  return [];
}

export async function getPatientDirectoryEntryById(patientId) {
  if (getSupabaseConfig().enabled) {
    return getPatientDirectoryEntryByIdSupabase(patientId);
  }
  return null;
}

export async function uploadPatientMedicalRecord(input) {
  if (getSupabaseConfig().enabled) {
    return uploadPatientMedicalRecordSupabase(input);
  }
  return uploadPatientMedicalRecordLocal(input);
}

export async function createPatientMedicalRecordDownload(email, recordId) {
  if (getSupabaseConfig().enabled) {
    return createPatientMedicalRecordDownloadSupabase(email, recordId);
  }
  return createPatientMedicalRecordDownloadLocal(email, recordId);
}

export async function getPatientBillingByEmail(email) {
  if (getSupabaseConfig().enabled) {
    return getPatientBillingSupabase(email);
  }
  return getPatientBillingLocal(email);
}

export async function upsertPatientBillingByEmail(email, patch = {}) {
  if (getSupabaseConfig().enabled) {
    return upsertPatientBillingSupabase(email, patch);
  }
  return upsertPatientBillingLocal(email, patch);
}

export async function listMealPlannerRecipes() {
  if (getSupabaseConfig().enabled) {
    return listMealPlannerRecipesSupabase();
  }
  return listMealPlannerRecipesLocal();
}

export async function listMealPlannerRecipesByIds(recipeIds = []) {
  if (getSupabaseConfig().enabled) {
    return listMealPlannerRecipesByIdsSupabase(recipeIds);
  }
  return listMealPlannerRecipesByIdsLocal(recipeIds);
}

export async function upsertMealPlannerRecipes(recipes = []) {
  if (getSupabaseConfig().enabled) {
    return upsertMealPlannerRecipesSupabase(recipes);
  }
  return upsertMealPlannerRecipesLocal(recipes);
}

export async function getLatestMealPlanGenerationCacheByPatientEmail(patientEmail) {
  if (getSupabaseConfig().enabled) {
    return getLatestMealPlanGenerationCacheByPatientEmailSupabase(patientEmail);
  }
  return getLatestMealPlanGenerationCacheByPatientEmailLocal(patientEmail);
}

export async function listMealPlanGenerationCacheByPatientEmail(patientEmail, limit = 24) {
  if (getSupabaseConfig().enabled) {
    return listMealPlanGenerationCacheByPatientEmailSupabase(patientEmail, limit);
  }
  return listMealPlanGenerationCacheByPatientEmailLocal(patientEmail, limit);
}

export async function getMealPlanGenerationCache(cacheKey) {
  if (getSupabaseConfig().enabled) {
    return getMealPlanGenerationCacheSupabase(cacheKey);
  }
  return getMealPlanGenerationCacheLocal(cacheKey);
}

export async function getMealPlanTemplateCacheByIntakeHash(intakeHash) {
  if (getSupabaseConfig().enabled) {
    return getMealPlanTemplateCacheByIntakeHashSupabase(intakeHash);
  }
  return getMealPlanTemplateCacheByIntakeHashLocal(intakeHash);
}

export async function upsertMealPlanGenerationCache({
  cacheKey,
  intakeHash,
  patientEmail,
  source = 'openai',
  stage = 'ai_recipes_v2',
  bundle,
}) {
  if (getSupabaseConfig().enabled) {
    return upsertMealPlanGenerationCacheSupabase({
      cacheKey,
      intakeHash,
      patientEmail,
      source,
      stage,
      bundle,
    });
  }
  return upsertMealPlanGenerationCacheLocal({
    cacheKey,
    intakeHash,
    patientEmail,
    source,
    stage,
    bundle,
  });
}

export function isSupabaseStorageEnabled() {
  return getSupabaseConfig().enabled;
}
