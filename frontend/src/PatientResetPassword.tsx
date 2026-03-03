import { useMemo, useState } from 'react';
import { ArrowRight, Lock } from 'lucide-react';
import { fetchApiJson } from './lib/api';

function getTokenFromUrl() {
  const search = new URLSearchParams(window.location.search);
  return String(search.get('token') || '').trim();
}

export default function PatientResetPassword() {
  const token = useMemo(getTokenFromUrl, []);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (!token) {
      setError('This reset link is missing a token.');
      return;
    }
    if (!password || password.length < 8) {
      setError('Use at least 8 characters for your new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    try {
      setLoading(true);
      const { response, payload } = await fetchApiJson('/api/patient/password/reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          password,
        }),
      });

      if (!response.ok) {
        throw new Error(payload.error || 'Unable to reset password.');
      }

      window.localStorage.setItem('onya_patient_token', payload.token || '');
      window.localStorage.setItem('onya_patient_email', payload?.patient?.email || '');
      setSuccess('Password updated. Redirecting...');
      window.setTimeout(() => {
        window.location.href = '/patient';
      }, 700);
    } catch (errorObject) {
      setError(errorObject instanceof Error ? errorObject.message : 'Unable to reset password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-sunlight-50 px-4 py-12 text-text-primary">
      <div className="mx-auto max-w-xl rounded-3xl border border-sand-200 bg-white p-6 shadow-[0_24px_42px_-34px_rgba(15,23,42,0.28)] md:p-8">
        <p className="inline-flex items-center rounded-full border border-sand-200 bg-sunlight-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-bark-600">
          Patient Security
        </p>
        <h1 className="mt-4 text-3xl leading-tight">Reset your password</h1>
        <p className="mt-2 text-bark-500">
          Create a new password to continue to your patient portal.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <label className="block">
            <span className="mb-2 block text-sm font-medium text-bark-600">New password</span>
            <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
              <Lock size={16} className="text-bark-400" />
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="h-11 w-full bg-transparent outline-none"
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm font-medium text-bark-600">Confirm password</span>
            <div className="flex items-center gap-2 rounded-xl border border-sand-200 bg-sunlight-50 px-3">
              <Lock size={16} className="text-bark-400" />
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="h-11 w-full bg-transparent outline-none"
                autoComplete="new-password"
                required
              />
            </div>
          </label>

          {error && <p className="text-sm font-medium text-red-600">{error}</p>}
          {success && <p className="text-sm font-medium text-emerald-600">{success}</p>}

          <button
            type="submit"
            disabled={loading}
            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {loading ? 'Updating...' : 'Update password'}
            <ArrowRight size={16} />
          </button>
        </form>

        <p className="mt-4 text-center text-xs text-bark-500">
          Return to <a href="/patient-login" className="underline underline-offset-2">patient login</a>.
        </p>
      </div>
    </div>
  );
}
