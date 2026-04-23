import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';

const LAST_UPDATED = '23 April 2026';
const COMPANY_NAME = 'Onya Health Pty Ltd';
const COMPANY_ABN = '85 207 753 898';

interface PolicySection {
    title: string;
    paragraphs: string[];
    bullets?: string[];
}

const POLICY_SECTIONS: PolicySection[] = [
    {
        title: '1. Who we are',
        paragraphs: [
            `${COMPANY_NAME} (ABN ${COMPANY_ABN}) operates the Onya Health websites, applications, and patient tools (Platform).`,
            'This Privacy Policy explains how we collect, use, store, and disclose personal information and health information when you use our Platform or request healthcare-related services through it.',
        ],
    },
    {
        title: '2. The information we collect',
        paragraphs: [
            'Depending on how you use the Platform, we may collect information needed to verify identity, communicate with you, and coordinate your care.',
        ],
        bullets: [
            'Identity and contact details, including your name, email, mobile number, and date of birth.',
            'Healthcare information you provide, including symptoms, medical history, medications, and supporting documents.',
            'Consultation and service records, such as outcomes, forms, referrals, or certificates.',
            'Technical information such as device/browser type, IP address, and platform usage logs.',
            'Payment-related details processed by approved payment providers.',
        ],
    },
    {
        title: '3. How we collect information',
        paragraphs: [
            'We collect information directly from you when you create an account, complete forms, contact support, request a service, or use patient portal features.',
            'We may also receive relevant information from clinicians, pharmacies, diagnostics partners, or service providers where this is required to deliver services safely and lawfully.',
        ],
    },
    {
        title: '4. Why we use your information',
        paragraphs: [
            'We use information to operate the Platform, verify account activity, coordinate requested services, and support clinical workflows.',
        ],
        bullets: [
            'Provide access to account and patient portal functions.',
            'Facilitate communication with independent practitioners and other care partners.',
            'Send service updates, confirmations, and account security messages.',
            'Improve platform quality, reliability, and patient experience.',
            'Comply with legal, regulatory, and safety obligations.',
        ],
    },
    {
        title: '5. Disclosure of information',
        paragraphs: [
            'We only disclose information where reasonably required for service delivery, legal compliance, safety, fraud prevention, or platform operations.',
        ],
        bullets: [
            'Independent AHPRA-registered practitioners engaged through the Platform.',
            'Partner pharmacies, pathology, and diagnostic providers where relevant to your request.',
            'Technology and operational service providers assisting with hosting, communications, support, and payments.',
            'Regulators, law enforcement, or other parties where required or authorised by law.',
        ],
    },
    {
        title: '6. Storage and security',
        paragraphs: [
            'We apply technical and organisational safeguards designed to protect information against unauthorised access, misuse, loss, or disclosure.',
            'No online system is risk-free, but we maintain controls such as access restrictions, secure transmission, and audit logging where appropriate.',
        ],
    },
    {
        title: '7. Direct marketing and notifications',
        paragraphs: [
            'We may send platform updates, operational notices, and limited marketing communications where permitted by law.',
            'You can opt out of marketing messages at any time by using unsubscribe options in the message or contacting us directly.',
        ],
    },
    {
        title: '8. Access and correction',
        paragraphs: [
            'You may request access to personal information we hold about you, and you may ask us to correct information that is inaccurate, out of date, incomplete, irrelevant, or misleading.',
            'To request access or correction, email us using the contact details below. We may need to verify your identity before actioning requests.',
        ],
    },
    {
        title: '9. Retention',
        paragraphs: [
            'We retain information only for as long as reasonably required for service delivery, clinical record obligations, legal compliance, dispute resolution, and operational integrity.',
        ],
    },
    {
        title: '10. Complaints',
        paragraphs: [
            'If you have a privacy concern, please contact us first so we can investigate and respond.',
            'If you are not satisfied with our response, you may contact the Office of the Australian Information Commissioner (OAIC).',
        ],
    },
    {
        title: '11. Updates to this policy',
        paragraphs: [
            'We may update this Privacy Policy from time to time. The latest version is published on this page with the updated date shown below.',
        ],
    },
];

export default function PrivacyPolicyPage() {
    useEffect(() => {
        document.title = 'Privacy Policy | Onya Health';
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute(
                'content',
                'Read the Onya Health Privacy Policy, including how we collect, use, store, and disclose personal and health information.'
            );
        }
    }, []);

    return (
        <main className="min-h-screen bg-bg">
            <header className="sticky top-0 z-40 border-b border-border bg-white shadow-sm">
                <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-4 md:px-6">
                    <HeaderBrand />
                    <div className="flex items-center gap-3">
                        <HeaderDropdown buttonClassName="flex h-10 w-10 items-center justify-center rounded-xl text-text-primary/90 transition-colors hover:bg-sand-75" />
                        <a
                            href="/doctor"
                            className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-semibold text-white transition hover:bg-primary-hover"
                        >
                            Start consult
                            <ArrowRight size={16} className="ml-2" />
                        </a>
                    </div>
                </div>
            </header>

            <section className="border-b border-border bg-sunlight-50">
                <div className="mx-auto w-full max-w-4xl px-4 py-14 md:px-6 md:py-16">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Privacy policy</p>
                    <h1 className="mt-4 text-4xl font-bold leading-tight text-text-primary md:text-5xl">Onya Health Privacy Policy</h1>
                    <p className="mt-4 text-base leading-relaxed text-text-secondary">
                        This policy describes how {COMPANY_NAME} (ABN {COMPANY_ABN}) handles personal and health information in connection with
                        the Onya Health Platform.
                    </p>
                    <p className="mt-3 text-sm font-medium text-text-primary">Last updated: {LAST_UPDATED}</p>
                </div>
            </section>

            <section className="bg-surface">
                <div className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-14">
                    <div className="space-y-8">
                        {POLICY_SECTIONS.map((section) => (
                            <article key={section.title} className="rounded-2xl border border-border bg-white p-6">
                                <h2 className="text-xl font-semibold text-text-primary">{section.title}</h2>
                                <div className="mt-3 space-y-3">
                                    {section.paragraphs.map((paragraph) => (
                                        <p key={paragraph} className="text-sm leading-relaxed text-text-secondary md:text-base">
                                            {paragraph}
                                        </p>
                                    ))}
                                </div>
                                {section.bullets ? (
                                    <ul className="mt-4 space-y-2">
                                        {section.bullets.map((bullet) => (
                                            <li key={bullet} className="flex items-start gap-3 text-sm leading-relaxed text-text-secondary md:text-base">
                                                <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-secondary" />
                                                <span>{bullet}</span>
                                            </li>
                                        ))}
                                    </ul>
                                ) : null}
                            </article>
                        ))}
                    </div>

                    <div className="mt-8 rounded-2xl border border-border bg-bg p-6">
                        <h2 className="text-xl font-semibold text-text-primary">Contact us</h2>
                        <p className="mt-3 text-sm leading-relaxed text-text-secondary md:text-base">
                            For privacy requests or complaints, email{' '}
                            <a className="font-medium text-primary hover:underline" href="mailto:hello@onyahealth.com.au">
                                hello@onyahealth.com.au
                            </a>{' '}
                            and include “Privacy” in the subject line.
                        </p>
                    </div>
                </div>
            </section>

            <Footer consultHref="/doctor" />
        </main>
    );
}
