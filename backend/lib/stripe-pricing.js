export const DEFAULT_STRIPE_PRICING_CENTS = Object.freeze({
  singleDay: 1121,
  multiDayMaximum: 2971,
  recurringMonthly: 1900,
  carerCertificate: 495,
});

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getStripePricing(body, configuration = {}) {
  const singleDayAmount = positiveInteger(
    configuration.singleDayAmount,
    DEFAULT_STRIPE_PRICING_CENTS.singleDay
  );
  const multiDayAmount = positiveInteger(
    configuration.multiDayAmount,
    DEFAULT_STRIPE_PRICING_CENTS.multiDayMaximum
  );
  const recurringAmount = positiveInteger(
    configuration.recurringAmount,
    DEFAULT_STRIPE_PRICING_CENTS.recurringMonthly
  );
  const carerAmount = positiveInteger(
    configuration.carerAmount,
    DEFAULT_STRIPE_PRICING_CENTS.carerCertificate
  );
  const durationDays = Math.min(7, Math.max(1, Math.floor(Number(body?.consult?.durationDays || 1))));
  const isUnlimited = Boolean(body?.consult?.isUnlimited);
  const includeCarerCertificate = !isUnlimited && Boolean(body?.consult?.includeCarerCertificate);
  const carerCertificateAmount = includeCarerCertificate ? carerAmount : 0;

  if (isUnlimited) {
    return {
      mode: 'subscription',
      baseUnitAmount: recurringAmount,
      carerCertificateAmount: 0,
      includeCarerCertificate: false,
      unitAmount: recurringAmount,
      productId: configuration.recurringProductId,
      displayName: 'Supadoc All Access',
      description: 'Monthly medical certificate request membership',
      recurringInterval: 'month',
      recurringIntervalCount: 1,
    };
  }

  if (durationDays === 1) {
    return {
      mode: 'payment',
      baseUnitAmount: singleDayAmount,
      carerCertificateAmount,
      includeCarerCertificate,
      unitAmount: singleDayAmount + carerCertificateAmount,
      productId: configuration.singleDayProductId,
      displayName: 'Medical certificate request (1 day)',
      description: 'One-day request for Australian doctor review',
    };
  }

  const cappedDuration = Math.min(durationDays, 5);
  const baseUnitAmount = singleDayAmount + Math.round(((cappedDuration - 1) * (multiDayAmount - singleDayAmount)) / 4);
  return {
    mode: 'payment',
    baseUnitAmount,
    carerCertificateAmount,
    includeCarerCertificate,
    unitAmount: baseUnitAmount + carerCertificateAmount,
    productId: configuration.multiDayProductId,
    displayName: `Medical certificate request (${durationDays} days)`,
    description: `${durationDays}-day request for Australian doctor review`,
  };
}
