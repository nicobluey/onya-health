import {
  EARLIEST_CERTIFICATE_DOB,
  MINIMUM_CERTIFICATE_PATIENT_AGE,
  calculateAgeYears,
  isValidIsoDate,
} from './patient-details.js';

export const EDITABLE_CERTIFICATE_DRAFT_FIELDS = [
  'fullName',
  'dob',
  'phone',
  'address',
  'purpose',
  'symptom',
  'symptomVisibility',
  'description',
  'startDate',
  'durationDays',
];

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function formatCalendarDate(value, timeZone = process.env.CERTIFICATE_TIME_ZONE || 'Australia/Brisbane') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date);
}

export function validateRequestedCertificateStartDate(value, now = new Date()) {
  const normalized = String(value || '').trim();
  if (!normalized) return { valid: true, value: formatCalendarDate(now), error: '' };
  if (!isValidIsoDate(normalized)) {
    return { valid: false, value: normalized, error: 'Certificate start date must be a valid date' };
  }
  if (normalized < formatCalendarDate(now)) {
    return { valid: false, value: normalized, error: 'Certificate start date must be today or later' };
  }
  return { valid: true, value: normalized, error: '' };
}

export function normalizeEditableCertificateFields(input, currentDraft = {}, now = new Date()) {
  const source = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const current = currentDraft && typeof currentDraft === 'object' ? currentDraft : {};
  const read = (key) => (Object.prototype.hasOwnProperty.call(source, key) ? source[key] : current[key]);
  const durationRaw = Number(read('durationDays') || 1);
  const durationDays = Number.isInteger(durationRaw) ? durationRaw : Number.NaN;
  const draft = {
    ...current,
    fullName: normalizeText(read('fullName'), 160),
    dob: normalizeText(read('dob'), 10),
    // The account email is the patient-record ownership key, not an editable certificate field.
    email: normalizeEmail(current.email),
    phone: normalizeText(read('phone'), 40),
    address: normalizeText(read('address'), 300),
    purpose: normalizeText(read('purpose'), 120),
    symptom: normalizeText(read('symptom'), 500),
    symptomVisibility: String(read('symptomVisibility') || '').trim().toLowerCase() === 'public'
      ? 'public'
      : 'private',
    description: normalizeText(read('description'), 4000),
    startDate: normalizeText(read('startDate'), 10),
    durationDays,
  };

  const errors = [];
  if (!draft.fullName) {
    errors.push('Patient name is required on the certificate');
  }
  if (draft.dob) {
    if (!isValidIsoDate(draft.dob)) {
      errors.push('Date of birth must be a valid date or removed');
    } else {
      const age = calculateAgeYears(draft.dob, now);
      if (draft.dob < EARLIEST_CERTIFICATE_DOB) {
        errors.push('Date of birth must be on or after 1 January 1900');
      } else if (age === null) {
        errors.push('Date of birth must be a valid date or removed');
      } else if (age < 0) {
        errors.push('Date of birth cannot be in the future');
      } else if (age < MINIMUM_CERTIFICATE_PATIENT_AGE) {
        errors.push(`Patient must be at least ${MINIMUM_CERTIFICATE_PATIENT_AGE} years old`);
      }
    }
  }
  if (draft.phone) {
    const phoneDigits = draft.phone.replace(/\D+/g, '');
    if (phoneDigits.length < 8 || phoneDigits.length > 15) {
      errors.push('Phone number must contain 8 to 15 digits or be removed');
    }
  }
  if (!isValidIsoDate(draft.startDate)) {
    errors.push('Certificate start date must be a valid date');
  }
  if (!Number.isInteger(durationDays) || durationDays < 1 || durationDays > 7) {
    errors.push('Certificate duration must be between 1 and 7 days');
  }

  return {
    valid: errors.length === 0,
    errors,
    draft: {
      ...draft,
      durationDays: Number.isInteger(durationDays) ? durationDays : 1,
    },
  };
}

export function mergeCertificateDraftIntoSubmission(rawSubmission, draft, workflowPatch = null) {
  const current = rawSubmission && typeof rawSubmission === 'object' && !Array.isArray(rawSubmission)
    ? rawSubmission
    : {};
  const next = {
    ...current,
    patient: {
      ...(current.patient && typeof current.patient === 'object' ? current.patient : {}),
      fullName: draft.fullName,
      dob: draft.dob,
      email: draft.email,
      phone: draft.phone,
      address: draft.address,
    },
    consult: {
      ...(current.consult && typeof current.consult === 'object' ? current.consult : {}),
      purpose: draft.purpose,
      symptom: draft.symptom,
      symptomVisibility: draft.symptomVisibility,
      description: draft.description,
      startDate: draft.startDate,
      durationDays: draft.durationDays,
    },
  };

  if (workflowPatch && typeof workflowPatch === 'object') {
    next.workflow = {
      ...(current.workflow && typeof current.workflow === 'object' ? current.workflow : {}),
      ...workflowPatch,
    };
  }
  return next;
}

export function changedEditableCertificateFields(before, after) {
  return EDITABLE_CERTIFICATE_DRAFT_FIELDS.filter(
    (field) => String(before?.[field] ?? '') !== String(after?.[field] ?? '')
  );
}
