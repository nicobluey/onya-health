import assert from 'node:assert/strict';
import test from 'node:test';

import {
  changedEditableCertificateFields,
  mergeCertificateDraftIntoSubmission,
  normalizeEditableCertificateFields,
  validateRequestedCertificateStartDate,
} from './certificate-fields.js';

const NOW = new Date('2026-08-10T02:00:00.000Z');
const CURRENT = {
  fullName: 'Alex Smith',
  dob: '1990-01-02',
  email: 'alex@example.com',
  phone: '0400 123 456',
  address: '1 Example Street',
  purpose: 'Work',
  symptom: 'Cold and flu',
  symptomVisibility: 'private',
  description: 'Fatigue and sore throat',
  startDate: '2026-08-10',
  durationDays: 1,
};

test('rejects patient-selected certificate dates before today', () => {
  assert.deepEqual(validateRequestedCertificateStartDate('2026-08-09', NOW), {
    valid: false,
    value: '2026-08-09',
    error: 'Certificate start date must be today or later',
  });
  assert.equal(validateRequestedCertificateStartDate('2026-08-10', NOW).valid, true);
  assert.equal(validateRequestedCertificateStartDate('2026-02-31', NOW).valid, false);
  assert.equal(validateRequestedCertificateStartDate('', NOW).value, '2026-08-10');
});

test('normalizes editable certificate fields while preserving omitted fields', () => {
  const result = normalizeEditableCertificateFields(
    { fullName: '  Alexandra Smith ', durationDays: 3 },
    CURRENT,
    NOW
  );

  assert.equal(result.valid, true);
  assert.equal(result.draft.fullName, 'Alexandra Smith');
  assert.equal(result.draft.durationDays, 3);
  assert.equal(result.draft.phone, CURRENT.phone);
});

test('does not allow certificate edits to change patient account ownership', () => {
  const result = normalizeEditableCertificateFields(
    { email: 'different-owner@example.com', symptomVisibility: 'public' },
    CURRENT,
    NOW
  );

  assert.equal(result.valid, true);
  assert.equal(result.draft.email, CURRENT.email);
  assert.equal(result.draft.symptomVisibility, 'public');
});

test('rejects invalid admin edits', () => {
  const result = normalizeEditableCertificateFields(
    { dob: '2026-08-10', phone: '123', durationDays: 12 },
    CURRENT,
    NOW
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /at least 16 years old/);
  assert.match(result.errors.join(' '), /8 to 15 digits/);
  assert.match(result.errors.join(' '), /between 1 and 7 days/);
});

test('keeps raw submission patient and consult fields in sync', () => {
  const nextDraft = { ...CURRENT, fullName: 'Alexandra Smith', durationDays: 2 };
  const merged = mergeCertificateDraftIntoSubmission(
    { patient: { gender: 'Female' }, consult: { complianceChecked: true } },
    nextDraft,
    { editedBy: 'admin@example.com' }
  );

  assert.equal(merged.patient.fullName, 'Alexandra Smith');
  assert.equal(merged.patient.gender, 'Female');
  assert.equal(merged.consult.durationDays, 2);
  assert.equal(merged.consult.complianceChecked, true);
  assert.equal(merged.workflow.editedBy, 'admin@example.com');
  assert.deepEqual(changedEditableCertificateFields(CURRENT, nextDraft), ['fullName', 'durationDays']);
});
