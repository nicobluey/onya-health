import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDefaultCertificateStatement } from './pdf.js';

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
