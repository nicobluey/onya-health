export const ONE_OFF_BASE_PRICE_AUD = 9.7;
export const ONE_OFF_EXTENDED_PRICE_AUD = 15;
export const ONE_OFF_EXTENDED_MIN_DAYS = 2;
export const UNLIMITED_MONTHLY_PRICE_AUD = 19;

function toWholeDays(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function getOneOffCertificatePrice(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration >= ONE_OFF_EXTENDED_MIN_DAYS) {
    return ONE_OFF_EXTENDED_PRICE_AUD;
  }
  return ONE_OFF_BASE_PRICE_AUD;
}

export function getOneOffPricingBandLabel(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration >= ONE_OFF_EXTENDED_MIN_DAYS) {
    return `${ONE_OFF_EXTENDED_MIN_DAYS}+ day pricing`;
  }

  const shortMaxDays = ONE_OFF_EXTENDED_MIN_DAYS - 1;
  if (shortMaxDays <= 1) return '1 day';
  return `${shortMaxDays} days or less`;
}

export function getOneOffCertificateBandLabel(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration >= ONE_OFF_EXTENDED_MIN_DAYS) {
    return `${ONE_OFF_EXTENDED_MIN_DAYS}+ day certificate`;
  }

  const shortMaxDays = ONE_OFF_EXTENDED_MIN_DAYS - 1;
  if (shortMaxDays <= 1) return '1 day certificate';
  return `${shortMaxDays} days or less`;
}

export function formatAud(amount: number) {
  return `$${amount.toFixed(2)}`;
}
