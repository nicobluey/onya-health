function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function patientProfileFromCertificate(certificate) {
  const draft = certificate?.certificateDraft || {};
  return {
    fullName: String(draft.fullName || '').trim(),
    dob: String(draft.dob || '').trim(),
    phone: String(draft.phone || '').trim(),
  };
}

function hasPatientProfileData(profile) {
  return Boolean(profile?.fullName || profile?.dob || profile?.phone);
}

export function getPatientCertificatesForEmail(certificates, email) {
  const normalizedEmail = normalizeEmail(email);
  return certificates
    .filter((cert) => {
      const certificateEmail =
        normalizeEmail(cert?.certificateDraft?.email) ||
        normalizeEmail(cert?.rawSubmission?.patient?.email) ||
        normalizeEmail(cert?.rawSubmission?.patientEmail) ||
        normalizeEmail(cert?.rawSubmission?.email) ||
        normalizeEmail(cert?.rawSubmission?.consult?.email) ||
        '';
      return certificateEmail === normalizedEmail;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getLatestPatientSnapshot(certificates, email) {
  const patientCertificates = getPatientCertificatesForEmail(certificates, email);
  const latest = patientCertificates[0] || null;
  const latestProfile = patientProfileFromCertificate(latest);
  return { patientCertificates, latest, latestProfile };
}

export async function syncPatientProfileFromLatest({
  email,
  latestCertificate,
  supabaseEnabled,
  upsertSupabasePatientMetadata,
  updatePatientAccountProfile,
}) {
  const profile = patientProfileFromCertificate(latestCertificate);
  if (!hasPatientProfileData(profile)) return null;

  if (supabaseEnabled) {
    return upsertSupabasePatientMetadata({
      email,
      fullName: profile.fullName,
      dob: profile.dob,
      phone: profile.phone,
    });
  }

  return updatePatientAccountProfile({
    email,
    fullName: profile.fullName,
    dob: profile.dob,
    phone: profile.phone,
  });
}
