import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

import {
  buildCertificatePdf,
  buildCertificateIdentityDetails,
  buildDefaultCertificateStatement,
  calculatePatientAge,
} from './pdf.js';

test('builds the requested default medical certificate wording', () => {
  const certificate = {
    certificateDraft: {
      fullName: 'Alex Smith',
      startDate: '2026-08-08',
      durationDays: 1,
    },
  };

  assert.equal(
    buildDefaultCertificateStatement(certificate, '2026-08-08T02:00:00.000Z'),
    'Following a telehealth consultation on 8 August 2026, in my opinion Alex Smith was suffering from a medical condition and was unfit to attend work on 8 August 2026. This certificate is based on my clinical assessment of the patient on the date of consultation as stated above.'
  );
});

test('calculates patient age at consultation without a date-only timezone shift', () => {
  assert.equal(calculatePatientAge('1990-08-10', '2026-08-09T10:00:00.000Z'), 35);
  assert.equal(calculatePatientAge('1990-08-09', '2026-08-09T10:00:00.000Z'), 36);
});

test('builds the patient identity details shown on the certificate', () => {
  assert.deepEqual(
    buildCertificateIdentityDetails(
      { certificateDraft: { fullName: 'Alex Smith', dob: '1990-08-09' } },
      '2026-08-09T10:00:00.000Z'
    ),
    {
      patientName: 'Alex Smith',
      ageAtConsultation: '36 years',
    }
  );
});

test('omits age details when date of birth is removed from the certificate draft', () => {
  assert.deepEqual(
    buildCertificateIdentityDetails(
      { certificateDraft: { fullName: 'Alex Smith', dob: '' } },
      '2026-08-09T10:00:00.000Z'
    ),
    {
      patientName: 'Alex Smith',
      ageAtConsultation: '',
    }
  );
});

test('keeps private doctor notes out of patient-facing PDF text', async (context) => {
  const privateNote = 'PRIVATE CLINICAL NOTE MUST NOT APPEAR';
  const pdf = await buildCertificatePdf({
    id: 'privacy-test',
    createdAt: '2026-08-10T02:00:00.000Z',
    certificateDraft: {
      fullName: 'Alex Smith',
      dob: '1990-08-09',
      startDate: '2026-08-10',
      durationDays: 1,
    },
    decision: {
      at: '2026-08-10T02:00:00.000Z',
      by: 'Dr Taylor',
      notes: privateNote,
      providerType: 'Medical practitioner',
      registrationNumber: 'MED000001',
      providerNumber: '123456A',
    },
  });
  const extraction = spawnSync('pdftotext', ['-', '-'], { input: pdf, encoding: 'utf8' });
  if (extraction.error?.code === 'ENOENT') {
    context.skip('pdftotext is not installed');
    return;
  }

  assert.equal(extraction.status, 0, extraction.stderr);
  assert.doesNotMatch(extraction.stdout, /PRIVATE CLINICAL NOTE MUST NOT APPEAR/);
  assert.doesNotMatch(extraction.stdout, /Clinician note:/);
});
