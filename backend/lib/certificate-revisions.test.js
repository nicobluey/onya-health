import assert from 'node:assert/strict';
import test from 'node:test';

import {
  archiveCurrentCertificateRevision,
  buildCertificateFromRevisionSnapshot,
  buildCertificateRevisionHistory,
  changedCertificateRevisionFields,
  createCertificateRevisionSnapshot,
  getArchivedCertificateRevisions,
  getCertificateIssueDate,
  getCertificatePdfFieldVisibility,
  getCertificateRevisionSnapshot,
  normalizeCertificateIssueDate,
  normalizeCertificatePdfFieldVisibility,
} from './certificate-revisions.js';

const NOW = new Date('2026-08-10T02:00:00.000Z');

function issuedCertificate() {
  return {
    id: 'certificate-1',
    createdAt: '2026-08-08T02:00:00.000Z',
    status: 'approved',
    certificateDraft: {
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
    },
    rawSubmission: {
      verificationCode: 'ONYA12345678',
      workflow: {
        reviewedAt: '2026-08-08T02:30:00.000Z',
        certificateIssueDate: '2026-08-08',
        certificateRevision: 1,
        certificateStatement: 'Original patient-facing wording.',
      },
    },
    decision: {
      by: 'Dr Taylor',
      byEmail: 'doctor@example.com',
      providerType: 'Medical practitioner',
      registrationNumber: 'MED000001',
      providerNumber: '123456A',
      signaturePath: 'doctor-signatures/doctor/signature.png',
      signatureMimeType: 'image/png',
      at: '2026-08-08T02:30:00.000Z',
      issueDate: '2026-08-08',
      notes: 'Private note that must not enter revision snapshots.',
      result: 'approved',
      certificateStatement: 'Original patient-facing wording.',
      revision: 1,
      pdfFieldVisibility: {
        dateOfBirth: false,
        age: true,
        purpose: false,
        symptom: false,
      },
    },
  };
}

test('normalizes explicit PDF field visibility and disables fields with no source value', () => {
  assert.deepEqual(
    normalizeCertificatePdfFieldVisibility(
      { dateOfBirth: true, age: false, purpose: true, symptom: true },
      {},
      { dob: '1990-01-02', purpose: '', symptom: 'Cold and flu' }
    ),
    {
      dateOfBirth: true,
      age: false,
      purpose: false,
      symptom: true,
    }
  );

  const legacy = issuedCertificate();
  delete legacy.decision.pdfFieldVisibility;
  assert.deepEqual(getCertificatePdfFieldVisibility(legacy), {
    dateOfBirth: false,
    age: true,
    purpose: false,
    symptom: false,
  });
});

test('validates editable issue dates against consultation date and today', () => {
  const certificate = issuedCertificate();
  assert.equal(getCertificateIssueDate(certificate, NOW), '2026-08-08');
  assert.equal(normalizeCertificateIssueDate('2026-08-09', certificate, NOW).valid, true);
  assert.match(
    normalizeCertificateIssueDate('2026-08-07', certificate, NOW).errors.join(' '),
    /before the consultation date/
  );
  assert.match(
    normalizeCertificateIssueDate('2026-08-11', certificate, NOW).errors.join(' '),
    /future/
  );
});

test('archives immutable patient-facing certificate state without private doctor notes', () => {
  const certificate = issuedCertificate();
  const workflow = archiveCurrentCertificateRevision(certificate, {
    archivedAt: '2026-08-10T03:00:00.000Z',
    archivedBy: 'admin@example.com',
    supersededByRevision: 2,
    changesToNextRevision: ['fullName', 'issueDate'],
  });
  certificate.rawSubmission.workflow = workflow;

  certificate.certificateDraft.fullName = 'Changed after archive';
  certificate.decision.notes = 'A different private note';
  const [snapshot] = getArchivedCertificateRevisions(certificate);

  assert.equal(snapshot.certificateDraft.fullName, 'Alex Smith');
  assert.equal(snapshot.archivedBy, 'admin@example.com');
  assert.deepEqual(snapshot.changesToNextRevision, ['fullName', 'issueDate']);
  assert.doesNotMatch(JSON.stringify(snapshot), /Private note|different private note/);

  const duplicateWorkflow = archiveCurrentCertificateRevision(certificate, {
    archivedAt: '2026-08-10T04:00:00.000Z',
  });
  assert.equal(duplicateWorkflow.certificateRevisionHistory.length, 1);
});

test('reconstructs an archived revision with its original clinician and PDF settings', () => {
  const certificate = issuedCertificate();
  const snapshot = createCertificateRevisionSnapshot(certificate, {
    archivedAt: '2026-08-10T03:00:00.000Z',
    supersededByRevision: 2,
  });
  const restored = buildCertificateFromRevisionSnapshot(certificate, snapshot);

  assert.equal(restored.certificateDraft.fullName, 'Alex Smith');
  assert.equal(restored.decision.by, 'Dr Taylor');
  assert.equal(restored.decision.issueDate, '2026-08-08');
  assert.equal(restored.decision.revision, 1);
  assert.equal(restored.decision.notes, undefined);
  assert.deepEqual(restored.decision.pdfFieldVisibility, snapshot.pdfFieldVisibility);
});

test('reports revision changes and exposes current plus superseded history', () => {
  const certificate = issuedCertificate();
  const before = {
    certificateDraft: certificate.certificateDraft,
    certificateStatement: certificate.decision.certificateStatement,
    issueDate: certificate.decision.issueDate,
    pdfFieldVisibility: certificate.decision.pdfFieldVisibility,
  };
  const after = {
    ...before,
    certificateDraft: { ...before.certificateDraft, fullName: 'Alexandra Smith' },
    issueDate: '2026-08-09',
    pdfFieldVisibility: { ...before.pdfFieldVisibility, dateOfBirth: true },
  };
  assert.deepEqual(changedCertificateRevisionFields(before, after), [
    'fullName',
    'issueDate',
    'pdfFieldVisibility.dateOfBirth',
  ]);

  certificate.rawSubmission.workflow = archiveCurrentCertificateRevision(certificate, {
    archivedAt: '2026-08-10T03:00:00.000Z',
    archivedBy: 'admin@example.com',
    supersededByRevision: 2,
    changesToNextRevision: ['fullName'],
  });
  certificate.decision.revision = 2;
  certificate.decision.reissuedAt = '2026-08-10T03:00:00.000Z';
  certificate.rawSubmission.workflow.certificateRevision = 2;
  certificate.rawSubmission.workflow.certificateRevisionChangedFields = ['fullName'];

  const history = buildCertificateRevisionHistory(certificate);
  assert.equal(history.length, 2);
  assert.equal(history[0].state, 'current');
  assert.equal(history[0].revision, 2);
  assert.equal(history[1].state, 'superseded');
  assert.equal(getCertificateRevisionSnapshot(certificate, 1).certificateDraft.fullName, 'Alex Smith');
});
