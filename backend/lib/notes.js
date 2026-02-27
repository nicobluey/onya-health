const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

function truncate(value, maxLength) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 3)}...`;
}

function certificateContext(certificate) {
  const draft = certificate?.certificateDraft || {};
  return [
    `Request ID: ${certificate?.id || 'unknown'}`,
    `Patient name: ${draft.fullName || 'Not provided'}`,
    `Patient email: ${draft.email || 'Not provided'}`,
    `Purpose: ${draft.purpose || 'Not provided'}`,
    `Primary symptom: ${draft.symptom || 'Not provided'}`,
    `Summary: ${draft.description || 'Not provided'}`,
    `Start date: ${draft.startDate || 'Not provided'}`,
    `Duration days: ${draft.durationDays || 'Not provided'}`,
    `Risk level: ${certificate?.risk?.level || 'unknown'} (${certificate?.risk?.score ?? 'n/a'})`,
  ].join('\n');
}

function fallbackDoctorNotes(certificate, doctorName) {
  const draft = certificate?.certificateDraft || {};
  return [
    `Reviewed by ${doctorName}.`,
    `Patient reports ${draft.symptom || 'symptoms'} with onset impacting normal duties.`,
    `Clinical summary: ${truncate(draft.description || 'No additional details supplied by patient.', 220)}`,
    `Assessment: patient is temporarily unfit for ${draft.purpose || 'work/study'} from ${draft.startDate || 'today'} for ${draft.durationDays || 1} day(s).`,
    'Recommendation: rest, hydration, and GP follow-up if symptoms persist or worsen.',
  ].join('\n');
}

function fallbackMoreInfoDraft(certificate) {
  const draft = certificate?.certificateDraft || {};
  const purpose = draft.purpose || 'work/study obligations';
  return [
    'More info requested before final decision:',
    `1. Confirm exact dates unable to attend ${purpose}.`,
    '2. Provide symptom onset time and whether symptoms are improving or worsening.',
    '3. Confirm any red-flag symptoms (chest pain, shortness of breath, fainting, severe dehydration).',
    '4. Share any current medications or treatment already tried.',
  ].join('\n');
}

function extractResponseText(payload) {
  if (!payload) return '';
  if (typeof payload.output_text === 'string' && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const output = Array.isArray(payload.output) ? payload.output : [];
  const chunks = [];

  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === 'string' && part.text.trim()) {
        chunks.push(part.text.trim());
      } else if (typeof part?.output_text === 'string' && part.output_text.trim()) {
        chunks.push(part.output_text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

async function runOpenAiPrompt(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY || '';
  if (!apiKey) {
    return '';
  }

  const preferredModel = process.env.OPENAI_NOTES_MODEL || 'gpt-5-nano';
  const models = [...new Set([preferredModel, 'gpt-5-nano'])];
  let lastError = null;

  for (const model of models) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [{ type: 'input_text', text: userPrompt }],
          },
        ],
        max_output_tokens: 280,
      }),
    });

    if (response.ok) {
      const payload = await response.json();
      return extractResponseText(payload);
    }

    const text = await response.text();
    const modelMissing = response.status === 400 && text.includes('model_not_found');
    if (modelMissing) {
      lastError = new Error(`OpenAI request failed (${response.status}): ${text}`);
      continue;
    }

    throw new Error(`OpenAI request failed (${response.status}): ${text}`);
  }

  throw lastError || new Error('OpenAI request failed: no model available');
}

export async function generateDoctorNotes(certificate, doctorName = 'Onya Health Doctor') {
  const systemPrompt = [
    'You are an Australian telehealth doctor writing certificate review notes.',
    'Write concise professional notes suitable for inclusion in a medical certificate.',
    'Return plain text only with 3 short sections:',
    '1) Clinical Summary',
    '2) Assessment',
    '3) Recommendation',
    'Avoid diagnosis certainty language. Keep under 140 words.',
  ].join('\n');

  const userPrompt = [
    'Draft doctor notes using this request context.',
    certificateContext(certificate),
    `Doctor name: ${doctorName}`,
  ].join('\n\n');

  try {
    const aiText = await runOpenAiPrompt(systemPrompt, userPrompt);
    if (aiText) return aiText;
  } catch (error) {
    console.error('Doctor notes AI generation failed:', error.message);
  }

  return fallbackDoctorNotes(certificate, doctorName);
}

export async function generateMoreInfoDraft(certificate) {
  const systemPrompt = [
    'You are assisting a telehealth doctor reviewing a medical certificate request.',
    'Generate follow-up questions to request missing information safely and clearly.',
    'Output plain text only, max 6 short numbered questions.',
  ].join('\n');

  const userPrompt = [
    'Generate a draft "more info required" note using this request context.',
    certificateContext(certificate),
  ].join('\n\n');

  try {
    const aiText = await runOpenAiPrompt(systemPrompt, userPrompt);
    if (aiText) return aiText;
  } catch (error) {
    console.error('More-info AI generation failed:', error.message);
  }

  return fallbackMoreInfoDraft(certificate);
}
