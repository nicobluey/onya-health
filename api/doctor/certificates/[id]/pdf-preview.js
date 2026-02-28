import { getCertificateById } from '../../../../backend/lib/storage.js';
import { buildCertificatePdf } from '../../../../backend/lib/pdf.js';
import { info } from '../../../../backend/lib/logger.js';
import { getDynamicRouteParam, parseJsonBody, requireDoctor, sendJson } from '../../../_lib/doctorApi.js';

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
    const doctor = await requireDoctor(req, res);
    if (!doctor) return;

    const certId = decodeURIComponent(getDynamicRouteParam(req, 'id'));
    const certificate = await getCertificateById(certId);
    if (!certificate) {
      sendJson(res, 404, { error: 'Certificate not found' });
      return;
    }

    const body = await parseJsonBody(req);
    const notes = String(body.notes || '').trim();
    const previewCertificate = {
      ...certificate,
      decision: {
        ...(certificate.decision || {}),
        by: doctor.email,
        at: new Date().toISOString(),
        notes,
      },
    };

    const pdfBuffer = buildCertificatePdf(previewCertificate, {
      doctorName: doctor.email,
      doctorNotes: notes,
      isPreview: true,
    });
    info('doctor.pdf.preview.generated', {
      doctor: doctor.email,
      certificateId: certId,
      bytes: pdfBuffer.length,
    });

    res.status(200);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="medical-certificate-preview-${previewCertificate.id}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    sendJson(res, 500, { error: err?.message || 'Unable to generate preview PDF' });
  }
}
