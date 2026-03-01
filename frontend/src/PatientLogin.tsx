import { useState } from 'react';
import { ArrowRight, Lock, Mail } from 'lucide-react';
import { fetchApiJson } from './lib/api';

export default function PatientLogin() {
    const [email, setEmail] = useState('');
    const [dob, setDob] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        setError('');

        if (!email || !email.includes('@')) {
            setError('Enter a valid email address.');
            return;
        }

        if (!dob) {
            setError('Enter your date of birth.');
            return;
        }

        try {
            setLoading(true);
            const { response, payload } = await fetchApiJson('/api/patient/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email,
                    dob,
                }),
            });
            if (!response.ok) {
                throw new Error(payload.error || 'Unable to log in right now');
            }

            window.localStorage.setItem('onya_patient_email', payload?.patient?.email || email);
            window.localStorage.setItem('onya_patient_token', payload.token || '');
            window.location.href = '/patient';
        } catch (errorObject) {
            setError(errorObject instanceof Error ? errorObject.message : 'Unable to log in right now');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#e8f1ff] text-[#1f1f23] px-4 py-10">
            <div className="mx-auto w-full max-w-md">
                <a href="/" className="inline-flex items-center gap-2 mb-8">
                    <img src="/logo.png" alt="Onya Health" className="h-10 w-auto object-contain" />
                </a>

                <div className="rounded-3xl border border-[#e0e0e0] bg-white p-6 shadow-sm">
                    <h1 className="text-3xl font-semibold leading-tight">Patient login</h1>
                    <p className="mt-2 text-[#6f6f73]">
                        Access your consult activity, profile, billing, and queue status.
                    </p>

                    <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-[#626267]">Email</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#dbdbdf] bg-[#fafafa] px-3">
                                <Mail size={16} className="text-[#8a8a8f]" />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="h-11 w-full bg-transparent outline-none"
                                    placeholder="you@example.com"
                                />
                            </div>
                        </label>

                        <label className="block">
                            <span className="mb-2 block text-sm font-medium text-[#626267]">Date of birth</span>
                            <div className="flex items-center gap-2 rounded-xl border border-[#dbdbdf] bg-[#fafafa] px-3">
                                <Lock size={16} className="text-[#8a8a8f]" />
                                <input
                                    type="date"
                                    value={dob}
                                    onChange={(e) => setDob(e.target.value)}
                                    className="h-11 w-full bg-transparent outline-none"
                                />
                            </div>
                        </label>

                        {error && <p className="text-sm font-medium text-red-600">{error}</p>}

                        <button
                            type="submit"
                            disabled={loading}
                            className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1f1f23] text-sm font-semibold text-white hover:bg-[#121214]"
                        >
                            {loading ? 'Signing in...' : 'Continue to patient portal'}
                            <ArrowRight size={16} />
                        </button>
                    </form>
                </div>

                <p className="mt-4 text-center text-xs text-[#7c7c81]">
                    Your account is created automatically after checkout using your consult email.
                </p>
                <p className="mt-1 text-center text-xs text-[#7c7c81]">
                    New patient? <a href="/doctor" className="underline underline-offset-2">Start a consult to create your account</a>.
                </p>
            </div>
        </div>
    );
}
