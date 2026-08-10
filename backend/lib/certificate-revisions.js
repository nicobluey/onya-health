import { EDITABLE_CERTIFICATE_DRAFT_FIELDS } from './certificate-fields.js';
import { isValidIsoDate } from './patient-details.js';

export const CERTIFICATE_PDF_FIELD_KEYS = [
  'dateOfBirth',
  'age',
  'purpose',
  'symptom',
];

export const DEFAULT_CERTIFICATE_PDF_FIELD_VISIBILITY = Object.freeze({
  dateOfBirth: false,
  age: true,
  purpose: false,
  symptom: false,
});

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function cloneJson(value, fallback) {
  if (!value || typeof value !== 'object') return fallback;
  return JSON.parse(JSON.stringify(value));
}

function formatCalendarDate(value, timeZone = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane') {
  const raw = String(value || '').trim();
  if (isValidIsoDate(raw)) return raw;

  const parsed = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(parsed.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(parsed);
}

function getWorkflow(certificate) {
  const workflow = certificate?.rawSubmission?.workflow;
  return workflow && typeof workflow === 'object' && !Array.isArray(workflow) ? workflow : {};
}

export function getCertificateRevision(certificate) {
  return Math.max(
    1,
    Number(certificate?.decision?.revision || getWorkflow(certificate).certificateRevision || 1)
  );
}

export function getCertificateConsultationDate(certificate, now = new Date()) {
  const workflow = getWorkflow(certificate);
  return formatCalendarDate(
    certificate?.decision?.at || workflow.reviewedAt || certificate?.createdAt || now
  ) || formatCalendarDate(now);
}

export function getCertificateIssueDate(certificate, now = new Date()) {
  const workflow = getWorkflow(certificate);
  const explicitDate = String(
    certificate?.decision?.issueDate || workflow.certificateIssueDate || ''
  ).trim();
  if (isValidIsoDate(explicitDate)) return explicitDate;

  const hasIssuedCertificate =
    String(certificate?.status || '').toLowerCase() === 'approved' ||
    String(certificate?.decision?.result || '').toLowerCase() === 'approved';
  if (!hasIssuedCertificate) return formatCalendarDate(now);

  return formatCalendarDate(
    certificate?.decision?.reissuedAt || certificate?.decision?.at || workflow.reviewedAt || certificate?.createdAt || now
  ) || formatCalendarDate(now);
}

export function normalizeCertificateIssueDate(value, certificate, now = new Date()) {
  const wasSupplied = value !== undefined && value !== null;
  const normalized = wasSupplied ? String(value || '').trim() : getCertificateIssueDate(certificate, now);
  const errors = [];

  if (!normalized) {
    errors.push('Certificate issue date is required');
  } else if (!isValidIsoDate(normalized)) {
    errors.push('Certificate issue date must be a valid date');
  } else {
    const today = formatCalendarDate(now);
    const consultationDate = getCertificateConsultationDate(certificate, now);
    if (normalized > today) {
      errors.push('Certificate issue date cannot be in the future');
    }
    if (consultationDate && normalized < consultationDate) {
      errors.push('Certificate issue date cannot be before the consultation date');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    value: normalized,
  };
}

export function getCertificatePdfFieldVisibility(certificate) {
  const workflow = getWorkflow(certificate);
  const stored = certificate?.decision?.pdfFieldVisibility || workflow.certificatePdfFieldVisibility;
  const draft = certificate?.certificateDraft || {};
  const fallback = {
    ...DEFAULT_CERTIFICATE_PDF_FIELD_VISIBILITY,
    symptom: String(draft.symptomVisibility || '').toLowerCase() === 'public',
  };

  return normalizeCertificatePdfFieldVisibility(stored, fallback, draft);
}

export function normalizeCertificatePdfFieldVisibility(input, fallback = {}, certificateDraft = {}) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const defaults = fallback && typeof fallback === 'object' && !Array.isArray(fallback) ? fallback : {};
  const draft = certificateDraft && typeof certificateDraft === 'object' ? certificateDraft : {};
  const readBoolean = (key) => (
    Object.prototype.hasOwnProperty.call(source, key)
      ? source[key] === true
      : Object.prototype.hasOwnProperty.call(defaults, key)
        ? defaults[key] === true
        : DEFAULT_CERTIFICATE_PDF_FIELD_VISIBILITY[key]
  );

  return {
    dateOfBirth: Boolean(draft.dob) && readBoolean('dateOfBirth'),
    age: Boolean(draft.dob) && readBoolean('age'),
    purpose: Boolean(draft.purpose) && readBoolean('purpose'),
    symptom: Boolean(draft.symptom) && readBoolean('symptom'),
  };
}

export function getCertificateStatement(certificate) {
  return String(
    certificate?.decision?.certificateStatement || getWorkflow(certificate).certificateStatement || ''
  ).trim();
}

export function normalizeCertificatePresentation(input, certificate, certificateDraft, now = new Date()) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const draft = certificateDraft && typeof certificateDraft === 'object'
    ? certificateDraft
    : certificate?.certificateDraft || {};
  const issueDate = normalizeCertificateIssueDate(
    Object.prototype.hasOwnProperty.call(source, 'issueDate') ? source.issueDate : undefined,
    certificate,
    now
  );
  const pdfFieldVisibility = normalizeCertificatePdfFieldVisibility(
    source.pdfFieldVisibility,
    getCertificatePdfFieldVisibility(certificate),
    draft
  );

  return {
    valid: issueDate.valid,
    errors: issueDate.errors,
    issueDate: issueDate.value,
    pdfFieldVisibility,
  };
}

export function getCertificateRevisionContent(certificate) {
  return {
    certificateDraft: cloneCertificateDraft(certificate?.certificateDraft),
    certificateStatement: getCertificateStatement(certificate),
    issueDate: getCertificateIssueDate(certificate),
    pdfFieldVisibility: getCertificatePdfFieldVisibility(certificate),
  };
}

function getCertificateIssuedAt(certificate) {
  const workflow = getWorkflow(certificate);
  return String(
    certificate?.decision?.reissuedAt ||
      workflow.reissuedAt ||
      certificate?.decision?.at ||
      workflow.reviewedAt ||
      certificate?.createdAt ||
      ''
  ).trim();
}

function cloneCertificateDraft(certificateDraft) {
  const source = certificateDraft && typeof certificateDraft === 'object' ? certificateDraft : {};
  const fields = [...EDITABLE_CERTIFICATE_DRAFT_FIELDS, 'email'];
  return fields.reduce((draft, field) => {
    if (Object.prototype.hasOwnProperty.call(source, field)) {
      draft[field] = cloneJson(source[field], source[field]);
    }
    return draft;
  }, {});
}

export function createCertificateRevisionSnapshot(certificate, metadata = {}) {
  const decision = certificate?.decision || {};
  return {
    revision: getCertificateRevision(certificate),
    issueDate: getCertificateIssueDate(certificate),
    issuedAt: getCertificateIssuedAt(certificate),
    consultationAt: String(decision.at || getWorkflow(certificate).reviewedAt || certificate?.createdAt || '').trim(),
    certificateDraft: cloneCertificateDraft(certificate?.certificateDraft),
    certificateStatement: getCertificateStatement(certificate),
    pdfFieldVisibility: getCertificatePdfFieldVisibility(certificate),
    clinician: {
      name: String(decision.by || '').trim(),
      email: normalizeEmail(decision.byEmail),
      providerType: String(decision.providerType || '').trim(),
      registrationNumber: String(decision.registrationNumber || '').trim().toUpperCase(),
      providerNumber: String(decision.providerNumber || '').trim().toUpperCase(),
      signaturePath: String(decision.signaturePath || '').trim(),
      signatureMimeType: String(decision.signatureMimeType || '').trim(),
    },
    archivedAt: String(metadata.archivedAt || '').trim(),
    archivedBy: normalizeEmail(metadata.archivedBy),
    supersededByRevision: metadata.supersededByRevision
      ? Math.max(1, Number(metadata.supersededByRevision))
      : null,
    changesToNextRevision: Array.isArray(metadata.changesToNextRevision)
      ? [...new Set(metadata.changesToNextRevision.map((field) => String(field || '').trim()).filter(Boolean))]
      : [],
  };
}

export function getArchivedCertificateRevisions(certificate) {
  const history = getWorkflow(certificate).certificateRevisionHistory;
  if (!Array.isArray(history)) return [];

  return cloneJson(history, [])
    .filter((entry) => entry && typeof entry === 'object' && Number(entry.revision) >= 1)
    .sort((left, right) => Number(left.revision) - Number(right.revision));
}

export function archiveCurrentCertificateRevision(certificate, metadata = {}) {
  const workflow = getWorkflow(certificate);
  const history = getArchivedCertificateRevisions(certificate);
  const revision = getCertificateRevision(certificate);
  if (!history.some((entry) => Number(entry.revision) === revision)) {
    history.push(createCertificateRevisionSnapshot(certificate, metadata));
  }

  return {
    ...workflow,
    certificateRevisionHistory: history.sort((left, right) => Number(left.revision) - Number(right.revision)),
  };
}

export function buildCertificateFromRevisionSnapshot(certificate, snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const clinician = snapshot.clinician && typeof snapshot.clinician === 'object' ? snapshot.clinician : {};
  const workflow = getWorkflow(certificate);
  const revision = Math.max(1, Number(snapshot.revision || 1));

  return {
    ...certificate,
    status: 'approved',
    certificateDraft: cloneCertificateDraft(snapshot.certificateDraft),
    rawSubmission: {
      ...(certificate?.rawSubmission && typeof certificate.rawSubmission === 'object' ? certificate.rawSubmission : {}),
      workflow: {
        ...workflow,
        reviewedByName: String(clinician.name || '').trim(),
        reviewedByEmail: normalizeEmail(clinician.email),
        providerType: String(clinician.providerType || '').trim(),
        registrationNumber: String(clinician.registrationNumber || '').trim().toUpperCase(),
        providerNumber: String(clinician.providerNumber || '').trim().toUpperCase(),
        signaturePath: String(clinician.signaturePath || '').trim(),
        signatureMimeType: String(clinician.signatureMimeType || '').trim(),
        reviewedAt: String(snapshot.consultationAt || snapshot.issuedAt || '').trim(),
        decisionResult: 'approved',
        certificateStatement: String(snapshot.certificateStatement || '').trim(),
        certificateRevision: revision,
        certificateIssueDate: String(snapshot.issueDate || '').trim(),
        certificatePdfFieldVisibility: normalizeCertificatePdfFieldVisibility(
          snapshot.pdfFieldVisibility,
          DEFAULT_CERTIFICATE_PDF_FIELD_VISIBILITY,
          snapshot.certificateDraft
        ),
      },
    },
    decision: {
      by: String(clinician.name || '').trim(),
      byEmail: normalizeEmail(clinician.email),
      providerType: String(clinician.providerType || '').trim(),
      registrationNumber: String(clinician.registrationNumber || '').trim().toUpperCase(),
      providerNumber: String(clinician.providerNumber || '').trim().toUpperCase(),
      signaturePath: String(clinician.signaturePath || '').trim(),
      signatureMimeType: String(clinician.signatureMimeType || '').trim(),
      at: String(snapshot.consultationAt || snapshot.issuedAt || '').trim(),
      result: 'approved',
      certificateStatement: String(snapshot.certificateStatement || '').trim(),
      revision,
      issueDate: String(snapshot.issueDate || '').trim(),
      pdfFieldVisibility: normalizeCertificatePdfFieldVisibility(
        snapshot.pdfFieldVisibility,
        DEFAULT_CERTIFICATE_PDF_FIELD_VISIBILITY,
        snapshot.certificateDraft
      ),
      ...(revision > 1 ? { reissuedAt: String(snapshot.issuedAt || '').trim() } : {}),
    },
  };
}

export function getCertificateRevisionSnapshot(certificate, revision) {
  const requestedRevision = Math.max(1, Number(revision || 0));
  if (requestedRevision === getCertificateRevision(certificate)) {
    return createCertificateRevisionSnapshot(certificate);
  }
  return getArchivedCertificateRevisions(certificate).find(
    (entry) => Number(entry.revision) === requestedRevision
  ) || null;
}

export function changedCertificateRevisionFields(before, after) {
  const beforeDraft = before?.certificateDraft || {};
  const afterDraft = after?.certificateDraft || {};
  const changed = EDITABLE_CERTIFICATE_DRAFT_FIELDS.filter(
    (field) => String(beforeDraft[field] ?? '') !== String(afterDraft[field] ?? '')
  );

  if (String(before?.certificateStatement || '') !== String(after?.certificateStatement || '')) {
    changed.push('certificateStatement');
  }
  if (String(before?.issueDate || '') !== String(after?.issueDate || '')) {
    changed.push('issueDate');
  }

  const beforeVisibility = before?.pdfFieldVisibility || {};
  const afterVisibility = after?.pdfFieldVisibility || {};
  CERTIFICATE_PDF_FIELD_KEYS.forEach((field) => {
    if (Boolean(beforeVisibility[field]) !== Boolean(afterVisibility[field])) {
      changed.push(`pdfFieldVisibility.${field}`);
    }
  });

  return changed;
}

export function buildCertificateRevisionHistory(certificate) {
  const workflow = getWorkflow(certificate);
  const archived = getArchivedCertificateRevisions(certificate).map((entry) => ({
    revision: Number(entry.revision),
    state: 'superseded',
    issueDate: String(entry.issueDate || ''),
    issuedAt: String(entry.issuedAt || ''),
    issuedBy: String(entry.clinician?.name || ''),
    archivedAt: String(entry.archivedAt || ''),
    supersededBy: String(entry.archivedBy || ''),
    changedFields: Array.isArray(entry.changesToNextRevision) ? entry.changesToNextRevision : [],
  }));
  const currentRevision = getCertificateRevision(certificate);

  return [
    {
      revision: currentRevision,
      state: 'current',
      issueDate: getCertificateIssueDate(certificate),
      issuedAt: getCertificateIssuedAt(certificate),
      issuedBy: String(certificate?.decision?.by || ''),
      archivedAt: '',
      supersededBy: '',
      changedFields: Array.isArray(workflow.certificateRevisionChangedFields)
        ? workflow.certificateRevisionChangedFields
        : [],
    },
    ...archived.sort((left, right) => right.revision - left.revision),
  ];
}
