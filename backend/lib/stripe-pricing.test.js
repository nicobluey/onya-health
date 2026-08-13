import assert from 'node:assert/strict';
import test from 'node:test';

import { getStripePricing } from './stripe-pricing.js';

const productConfiguration = {
  singleDayProductId: 'prod_single',
  multiDayProductId: 'prod_multi',
  recurringProductId: 'prod_recurring',
};

test('matches the funnel price for every supported certificate duration', () => {
  const expectedCents = [917, 1431, 1944, 2458, 2971, 2971, 2971];
  const actualCents = expectedCents.map((_, index) =>
    getStripePricing({ consult: { durationDays: index + 1 } }, productConfiguration).unitAmount
  );

  assert.deepEqual(actualCents, expectedCents);
});

test('adds the carer certificate price once', () => {
  const pricing = getStripePricing(
    { consult: { durationDays: 4, includeCarerCertificate: true } },
    productConfiguration
  );

  assert.equal(pricing.baseUnitAmount, 2458);
  assert.equal(pricing.carerCertificateAmount, 495);
  assert.equal(pricing.unitAmount, 2953);
});

test('uses a true monthly interval for All Access', () => {
  const pricing = getStripePricing(
    { consult: { durationDays: 7, isUnlimited: true, includeCarerCertificate: true } },
    productConfiguration
  );

  assert.equal(pricing.mode, 'subscription');
  assert.equal(pricing.unitAmount, 1900);
  assert.equal(pricing.recurringInterval, 'month');
  assert.equal(pricing.recurringIntervalCount, 1);
  assert.equal(pricing.includeCarerCertificate, false);
});
