const RED_FLAG_PHRASES = [
  'chest pain',
  'shortness of breath',
  'fainting',
  'suicidal',
  'self-harm',
  'severe bleeding',
  'loss of consciousness',
];

export function calculateRisk(payload) {
  const reasons = [];
  let score = 1;

  const symptom = String(payload?.consult?.symptom || '').toLowerCase();
  const description = String(payload?.consult?.description || '').toLowerCase();
  const durationDays = Number(payload?.consult?.durationDays || 1);
  const complianceChecked = Boolean(payload?.consult?.complianceChecked);

  if (symptom.includes('covid')) {
    score += 2;
    reasons.push('COVID-19 symptoms selected');
  }

  if (symptom.includes('mental health')) {
    score += 2;
    reasons.push('Mental health symptoms selected');
  }

  if (symptom.includes('injury')) {
    score += 1;
    reasons.push('Injury symptoms selected');
  }

  if (durationDays >= 3) {
    score += 1;
    reasons.push(`Requested ${durationDays} day certificate`);
  }

  if (!complianceChecked) {
    score += 3;
    reasons.push('Required compliance checks were not completed');
  }

  for (const phrase of RED_FLAG_PHRASES) {
    if (description.includes(phrase)) {
      score += 2;
      reasons.push(`Red-flag phrase detected: "${phrase}"`);
    }
  }

  let level = 'LOW';
  if (score >= 5) {
    level = 'HIGH';
  } else if (score >= 3) {
    level = 'MEDIUM';
  }

  return {
    score,
    level,
    reasons,
  };
}
