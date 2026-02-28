import { listCertificates } from '../../../backend/lib/storage.js';
import { info } from '../../../backend/lib/logger.js';
import { OPEN_REVIEW_STATUSES, requireDoctor, sendJson } from '../../_lib/doctorApi.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    sendJson(res, 405, { error: 'Method not allowed' });
    return;
  }

  try {
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const statusFilter = req.query?.status
      ? Array.isArray(req.query.status)
        ? req.query.status[0]
        : req.query.status
      : null;
    const items = await listCertificates();

    const filtered = items
      .filter((item) => {
        if (!statusFilter) return true;
        if (statusFilter === 'pending') {
          return OPEN_REVIEW_STATUSES.has(String(item.status || '').toLowerCase());
        }
        return item.status === statusFilter;
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((item) => ({
        id: item.id,
        createdAt: item.createdAt,
        status: item.status,
        serviceType: item.serviceType,
        patientName: item?.certificateDraft?.fullName || '',
        risk: item.risk,
      }));

    sendJson(res, 200, {
      doctor: doctor.email,
      count: filtered.length,
      certificates: filtered,
    });
    info('doctor.queue.loaded', {
      doctor: doctor.email,
      statusFilter: statusFilter || 'all',
      count: filtered.length,
    });
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to load doctor queue' });
  }
}
