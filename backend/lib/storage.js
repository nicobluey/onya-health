import fs from 'node:fs/promises';
import path from 'node:path';

const DATA_DIR = path.resolve(process.cwd(), 'backend', 'data');
const DB_PATH = path.join(DATA_DIR, 'db.json');

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

const EMPTY_DB = {
  certificates: [],
  auditLog: [],
  patientBilling: [],
};

let writeQueue = Promise.resolve();

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
  return {
    id: item.id,
    createdAt: item.createdAt,
    status: item.status,
    serviceType: item.serviceType,
    risk: item.risk,
    certificateDraft: item.certificateDraft,
    rawSubmission: item.rawSubmission,
    decision: item.decision || null,
  };
}

function mapSupabaseRowToCertificate(row) {
  const rawMedicalRequest = row.medical_certificate_requests;
  const med = Array.isArray(rawMedicalRequest) ? rawMedicalRequest[0] || {} : rawMedicalRequest || {};

  const createdAt = row.submitted_at || row.created_at || new Date().toISOString();
  const rawSubmission = med.raw_submission || null;
  let status = row.status || 'submitted';
  // Supabase enum may not include "awaiting_payment"; infer it from payment metadata.
  if (
    status === 'submitted' &&
    rawSubmission?.payment?.provider === 'stripe' &&
    rawSubmission?.payment?.status &&
    rawSubmission.payment.status !== 'paid'
  ) {
    status = 'awaiting_payment';
  }
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
    status,
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
          by: row.assigned_provider_id || 'provider',
          at: decisionTimestamp,
          notes: decisionNotes,
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
  if (status === 'pending') return 'submitted';
  return status;
}

function toSupabaseRiskLevel(level) {
  const normalized = String(level || 'low').toLowerCase();
  if (['low', 'medium', 'high', 'urgent'].includes(normalized)) {
    return normalized;
  }
  return 'low';
}

function fromSupabaseRequestStatus(status) {
  if (!status) return 'submitted';
  return status;
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
  return match ? match[1] : null;
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
  const patientEmail = String(draft.email || '').trim();
  if (!patientEmail) {
    throw new Error('Patient email is required to create a linked auth user');
  }
  const fullName = String(draft.fullName || '').trim();
  const [firstName = '', ...rest] = fullName.split(/\s+/);
  const lastName = rest.join(' ');
  let patientId = null;

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
    const match = allUsers.find((user) => user?.email?.toLowerCase() === patientEmail.toLowerCase());
    patientId = match?.id || null;
  }

  if (!patientId) {
    throw new Error('Failed to resolve patient auth user id');
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
      consent_telehealth: true,
      consent_marketing: false,
    },
  });

  return patientId;
}

async function createCertificateSupabase(certificate) {
  const patientId = certificate.rawSubmission?.patientId || (await createPatientForSubmission(certificate));

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

export async function listCertificates() {
  if (getSupabaseConfig().enabled) {
    return listCertificatesSupabase();
  }
  return listCertificatesLocal();
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

export function isSupabaseStorageEnabled() {
  return getSupabaseConfig().enabled;
}
