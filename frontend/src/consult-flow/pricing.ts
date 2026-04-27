export const ONE_OFF_BASE_PRICE_AUD = 9.71;
export const ONE_OFF_MAX_PRICE_AUD = 29.71;
export const ONE_OFF_MAX_PRICE_DAY = 5;
export const ONE_OFF_CAP_END_DAY = 7;
export const UNLIMITED_MONTHLY_PRICE_AUD = 19;

function toWholeDays(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(1, Math.floor(value));
}

export function getOneOffCertificatePrice(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration <= 1) {
    return ONE_OFF_BASE_PRICE_AUD;
  }

  const cappedDuration = Math.min(safeDuration, ONE_OFF_MAX_PRICE_DAY);
  const linearRangeDays = ONE_OFF_MAX_PRICE_DAY - 1;
  if (linearRangeDays <= 0) {
    return ONE_OFF_MAX_PRICE_AUD;
  }

  const baseCents = Math.round(ONE_OFF_BASE_PRICE_AUD * 100);
  const maxCents = Math.round(ONE_OFF_MAX_PRICE_AUD * 100);
  const centsDelta = maxCents - baseCents;
  const progressDays = cappedDuration - 1;
  const scaledCents = baseCents + Math.round((progressDays * centsDelta) / linearRangeDays);

  return scaledCents / 100;
}

export function getOneOffPricingBandLabel(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration <= 1) {
    return '1 day base price';
  }

  if (safeDuration >= ONE_OFF_MAX_PRICE_DAY && safeDuration <= ONE_OFF_CAP_END_DAY) {
    return `${ONE_OFF_MAX_PRICE_DAY}-${ONE_OFF_CAP_END_DAY} day capped price`;
  }

  if (safeDuration > ONE_OFF_CAP_END_DAY) {
    return `${ONE_OFF_CAP_END_DAY}+ day capped price`;
  }

  return `Day ${safeDuration} linear price`;
}

export function getOneOffCertificateBandLabel(durationDays: number) {
  const safeDuration = toWholeDays(durationDays);
  if (safeDuration <= 1) {
    return '1 day certificate';
  }

  if (safeDuration > ONE_OFF_CAP_END_DAY) {
    return `${ONE_OFF_CAP_END_DAY}+ day certificate`;
  }

  return `${safeDuration} day certificate`;
}

export function formatAud(amount: number) {
  return `$${amount.toFixed(2)}`;
}
