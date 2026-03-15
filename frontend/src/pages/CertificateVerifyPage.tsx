import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BadgeCheck, Search, ShieldX } from 'lucide-react';
import { fetchApiJson } from '../lib/api';

type VerifyCertificatePayload = {
  code: string;
  certificateId: string;
  issuedAt: string;
  status: string;
  startDate: string;
  durationDays: number;
  purpose: string;
  patient: string;
  doctorName: string;
  providerType: string;
  registrationNumber: string;
};

function normalizeCode(value: string) {
  return String(value || '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');
}

function getInitialCode() {
  const search = new URLSearchParams(window.location.search);
  return normalizeCode(search.get('code') || '');
}

export default function CertificateVerifyPage() {
  const [code, setCode] = useState(getInitialCode());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<VerifyCertificatePayload | null>(null);

  const statusLabel = useMemo(() => {
    if (!result) return '';
    return String(result.status || '').toUpperCase();
  }, [result]);

  const handleVerify = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const normalizedCode = normalizeCode(code);
    setCode(normalizedCode);
    setError('');
    setResult(null);

    if (!normalizedCode) {
      setError('Enter a verification code.');
      return;
    }

    setLoading(true);
    try {
      const { response, payload } = await fetchApiJson(
        `/api/certificates/verify?code=${encodeURIComponent(normalizedCode)}`,
        { method: 'GET' }
      );

      if (!response.ok || !payload?.valid || !payload?.certificate) {
        throw new Error(payload?.error || 'Certificate could not be verified.');
      }

      setResult(payload.certificate as VerifyCertificatePayload);
    } catch (errorObject) {
      setError(errorObject instanceof Error ? errorObject.message : 'Certificate could not be verified.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!code) return;
    void handleVerify();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-sunlight-50 px-4 py-10 text-text-primary">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between rounded-2xl border border-sand-200 bg-white px-4 py-3 shadow-sm">
          <a href="/" className="inline-flex items-center" aria-label="Onya Health home">
            <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
          </a>
          <div className="flex items-center gap-2">
            <a href="/patient-login" className="inline-flex items-center rounded-full border border-sand-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700">
              Patient login
            </a>
            <a href="/doctor" className="inline-flex items-center rounded-full border border-sand-200 bg-white px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-bark-700">
              Start consult
            </a>
          </div>
        </header>

        <section className="rounded-3xl border border-sand-200 bg-white p-6 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.28)] md:p-8">
          <p className="inline-flex items-center rounded-full border border-sand-200 bg-sunlight-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-bark-600">
            Certificate verification
          </p>
          <h1 className="mt-4 text-4xl leading-tight md:text-5xl">Verify a medical certificate</h1>
          <p className="mt-2 max-w-2xl text-bark-500">
            Enter the verification code shown on an Onya Health medical certificate (for example, ONYA1234AB).
          </p>

          <form onSubmit={handleVerify} className="mt-6 grid gap-3 md:grid-cols-[1fr_auto]">
            <label className="block">
              <span className="mb-2 block text-sm font-medium text-bark-600">Verification code</span>
              <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
                <Search size={16} className="text-bark-400" />
                <input
                  type="text"
                  value={code}
                  onChange={(event) => setCode(normalizeCode(event.target.value))}
                  className="h-11 w-full bg-transparent font-semibold tracking-[0.08em] outline-none"
                  placeholder="ONYA1234AB"
                  autoCapitalize="characters"
                  autoCorrect="off"
                />
              </div>
            </label>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex h-11 items-center justify-center gap-2 self-end rounded-xl bg-primary px-5 text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
            >
              {loading ? 'Verifying...' : 'Verify certificate'}
              <ArrowRight size={16} />
            </button>
          </form>

          {error && (
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <ShieldX size={18} className="mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-emerald-700">
                    <BadgeCheck size={14} /> Verified
                  </p>
                  <h2 className="mt-3 text-2xl">Certificate is valid</h2>
                </div>
                <div className="rounded-lg bg-white px-3 py-2 text-right">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Status</p>
                  <p className="text-sm font-semibold text-bark-900">{statusLabel || '-'}</p>
                </div>
              </div>

              <div className="mt-5 grid gap-3 md:grid-cols-2">
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Verification code</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.code}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Certificate ID</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.certificateId}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Issued</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{new Date(result.issuedAt).toLocaleString()}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Patient</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.patient}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Doctor</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.doctorName || '-'}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Provider / Registration</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">
                    {result.providerType || '-'} {result.registrationNumber ? `· ${result.registrationNumber}` : ''}
                  </p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Start date</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.startDate || '-'}</p>
                </div>
                <div className="rounded-xl border border-emerald-100 bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.08em] text-bark-500">Duration</p>
                  <p className="mt-1 text-sm font-semibold text-bark-900">{result.durationDays} day(s)</p>
                </div>
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
