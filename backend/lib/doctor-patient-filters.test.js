import assert from 'node:assert/strict';
import test from 'node:test';

import {
  certificateMatchesDoctorPatientFilters,
  parseDoctorPatientRequestFilters,
} from './doctor-patient-filters.js';

test('parses relative submission and duration filters', () => {
  const now = new Date('2026-08-08T12:00:00.000Z').getTime();
  const filters = parseDoctorPatientRequestFilters(
    new URLSearchParams('submittedWithin=7&durationMin=2&durationMax=5'),
    now
  );

  assert.equal(filters.valid, true);
  assert.equal(filters.submittedAfter, '2026-08-01T12:00:00.000Z');
  assert.equal(filters.durationMin, 2);
  assert.equal(filters.durationMax, 5);
  assert.equal(filters.hasRequestFilters, true);
});

test('uses Brisbane day boundaries for a custom date range', () => {
  const filters = parseDoctorPatientRequestFilters(
    new URLSearchParams('dateFrom=2026-08-01&dateTo=2026-08-08')
  );

  assert.equal(filters.valid, true);
  assert.equal(filters.submittedAfter, '2026-07-31T14:00:00.000Z');
  assert.equal(filters.submittedBefore, '2026-08-08T13:59:59.999Z');
});

test('rejects invalid dates, conflicting dates, and inverted durations', () => {
  const invalidDate = parseDoctorPatientRequestFilters(new URLSearchParams('dateFrom=2026-02-31'));
  const conflictingDate = parseDoctorPatientRequestFilters(
    new URLSearchParams('submittedWithin=7&dateFrom=2026-08-01')
  );
  const invertedDuration = parseDoctorPatientRequestFilters(
    new URLSearchParams('durationMin=6&durationMax=2')
  );

  assert.equal(invalidDate.valid, false);
  assert.equal(conflictingDate.valid, false);
  assert.equal(invertedDuration.valid, false);
});

test('matches certificates against date and duration together', () => {
  const filters = parseDoctorPatientRequestFilters(
    new URLSearchParams('dateFrom=2026-08-01&dateTo=2026-08-08&durationMin=3&durationMax=5')
  );
  const matching = {
    createdAt: '2026-08-04T03:00:00.000Z',
    certificateDraft: { durationDays: 4 },
  };
  const tooLong = {
    createdAt: '2026-08-04T03:00:00.000Z',
    certificateDraft: { durationDays: 7 },
  };

  assert.equal(certificateMatchesDoctorPatientFilters(matching, filters), true);
  assert.equal(certificateMatchesDoctorPatientFilters(tooLong, filters), false);
});
