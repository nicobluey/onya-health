import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MINIMUM_CERTIFICATE_PATIENT_AGE,
  calculateAgeYears,
  validateCertificatePatientDetails,
} from './patient-details.js';

const NOW = new Date('2026-08-09T12:00:00.000Z');

test('requires date of birth and phone for certificate submissions', () => {
  const result = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      email: 'taylor@example.com',
    },
    NOW
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /Date of birth is required/);
  assert.match(result.errors.join(' '), /Phone number is required/);
});

test('rejects invalid and future dates of birth', () => {
  const invalid = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      dob: '2026-02-31',
      email: 'taylor@example.com',
      phone: '0400 123 456',
    },
    NOW
  );
  const future = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      dob: '2026-08-10',
      email: 'taylor@example.com',
      phone: '0400 123 456',
    },
    NOW
  );

  assert.equal(invalid.valid, false);
  assert.match(invalid.errors.join(' '), /valid date/);
  assert.equal(future.valid, false);
  assert.match(future.errors.join(' '), /future/);
});

test('requires the self-service patient to be at least 16 years old', () => {
  const tooYoung = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      dob: '2010-08-10',
      email: 'taylor@example.com',
      phone: '0400 123 456',
    },
    NOW
  );
  const oldEnough = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      dob: '2010-08-09',
      email: 'taylor@example.com',
      phone: '0400 123 456',
    },
    NOW
  );

  assert.equal(MINIMUM_CERTIFICATE_PATIENT_AGE, 16);
  assert.equal(tooYoung.valid, false);
  assert.match(tooYoung.errors.join(' '), /at least 16 years old/);
  assert.equal(oldEnough.valid, true);
});

test('calculates age from calendar dates without timezone drift', () => {
  assert.equal(calculateAgeYears('2010-08-10', NOW), 15);
  assert.equal(calculateAgeYears('2010-08-09', NOW), 16);
});

test('rejects implausibly old dates of birth', () => {
  const result = validateCertificatePatientDetails(
    {
      fullName: 'Taylor Patient',
      dob: '1899-12-31',
      email: 'taylor@example.com',
      phone: '0400 123 456',
    },
    NOW
  );

  assert.equal(result.valid, false);
  assert.match(result.errors.join(' '), /1 January 1900/);
});

test('normalizes and accepts complete patient details', () => {
  const result = validateCertificatePatientDetails(
    {
      fullName: '  Taylor Patient  ',
      dob: '1990-03-14',
      email: ' TAYLOR@EXAMPLE.COM ',
      phone: '+61 400 123 456',
      address: ' 1 Example Street ',
    },
    NOW
  );

  assert.equal(result.valid, true);
  assert.equal(result.patient.fullName, 'Taylor Patient');
  assert.equal(result.patient.email, 'taylor@example.com');
  assert.equal(result.patient.phone, '+61 400 123 456');
});
