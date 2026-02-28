import { issueDoctorToken, validateDoctorCredentials } from '../../backend/lib/auth.js';
import { info } from '../../backend/lib/logger.js';
import { parseJsonBody, sendJson } from '../_lib/doctorApi.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const body = await parseJsonBody(req);
    const email = String(body.email || '');
    const password = String(body.password || '');

    if (!validateDoctorCredentials(email, password)) {
      sendJson(res, 401, { error: 'Invalid credentials' });
      return;
    }

    const token = issueDoctorToken(email);
    info('doctor.login.success', { email });
    sendJson(res, 200, {
      token,
      doctor: {
        email,
        name: process.env.DOCTOR_DISPLAY_NAME || 'Onya Health Doctor',
      },
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to log in right now' });
  }
}
