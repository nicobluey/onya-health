import { useEffect } from 'react';
import { ArrowRight } from 'lucide-react';
import { Footer } from '../components/Footer';
import { HeaderBrand } from '../components/HeaderBrand';
import { HeaderDropdown } from '../components/HeaderDropdown';

const LAST_UPDATED = '23 April 2026';
const COMPANY_NAME = 'Onya Health Pty Ltd';
const COMPANY_ABN = '85 207 753 898';

interface TermsSection {
    title: string;
    paragraphs: string[];
    bullets?: string[];
}

const TERMS_SECTIONS: TermsSection[] = [
    {
        title: '1. Acceptance of these Terms',
        paragraphs: [
            `These Terms govern your use of the Onya Health websites, applications, and related services provided by ${COMPANY_NAME} (ABN ${COMPANY_ABN}) (Onya Health, we, us, our).`,
            'By accessing or using the Platform, you agree to be bound by these Terms. If you access the Platform for another person, you confirm you are legally authorised to act for them and accept these Terms on their behalf.',
        ],
    },
    {
        title: '2. Emergency situations',
        paragraphs: [
            'Do not use the Platform for urgent or life-threatening situations.',
        ],
        bullets: [
            'If you need immediate medical help, call 000 immediately.',
            'For urgent clinical advice, contact your regular GP or local emergency department.',
        ],
    },
    {
        title: '3. Our role and independent practitioners',
        paragraphs: [
            'Onya Health provides technology, administration, and workflow support to facilitate access to healthcare services delivered by independent AHPRA-registered practitioners and other providers.',
            'We do not provide medical advice through customer support channels, and we are not a substitute for your regular in-person healthcare providers.',
        ],
    },
    {
        title: '4. No guaranteed clinical outcome',
        paragraphs: [
            'Clinical decisions are made independently by practitioners based on professional judgment, applicable standards, and the information you provide.',
        ],
        bullets: [
            'A request does not guarantee a certificate, referral, prescription, or other outcome.',
            'Practitioners may decline requests that are clinically inappropriate, unsafe, or not legally permitted.',
            'Controlled and high-risk medications may be excluded from service pathways.',
        ],
    },
    {
        title: '5. Partner service providers',
        paragraphs: [
            'Where relevant, we may facilitate coordination with partner pharmacies, pathology services, imaging providers, or other healthcare partners.',
            'Those providers operate independently and set their own acceptance criteria, timelines, and service terms.',
        ],
    },
    {
        title: '6. Eligibility and use conditions',
        paragraphs: [
            'To use the Platform, you must provide accurate information and use the services lawfully and in good faith.',
        ],
        bullets: [
            'You must be in Australia when requesting and receiving services through the Platform.',
            'You must not submit false, misleading, or incomplete clinical information.',
            'You must keep your contact details and account information current.',
        ],
    },
    {
        title: '7. Account security',
        paragraphs: [
            'You are responsible for activity under your account and for keeping your login credentials secure.',
            'If you suspect unauthorised access, notify us promptly at hello@onyahealth.com.au.',
        ],
    },
    {
        title: '8. Family or dependent access',
        paragraphs: [
            'If account features allow you to manage services for family members or dependants, you must have lawful authority to do so.',
            'Adults manage their own health information unless they explicitly grant access. For minors, parent or guardian involvement may be required.',
        ],
    },
    {
        title: '9. Fees and payment',
        paragraphs: [
            'Fees are displayed at or before checkout. Unless stated otherwise, fees are charged in Australian dollars.',
        ],
        bullets: [
            'Payment is required in advance using an accepted payment method.',
            'Some services may be one-off services and others may be subscription-based.',
            'Where taxes apply, they may be included or added as required by law.',
        ],
    },
    {
        title: '10. Cancellations and refunds',
        paragraphs: [
            'Nothing in these Terms limits rights you may have under Australian Consumer Law.',
            'Where a requested clinical outcome is declined by a practitioner as clinically unsuitable, we may provide a refund according to the service rules shown at purchase.',
            'If subscription services are offered, cancellation settings and billing cut-off times are available in your account or at checkout.',
        ],
    },
    {
        title: '11. Platform use restrictions',
        paragraphs: [
            'You must not misuse the Platform or interfere with its operation, security, or availability.',
        ],
        bullets: [
            'No scraping, reverse engineering, malware, spam, or unauthorised automated access.',
            'No abusive, unlawful, defamatory, or discriminatory conduct on the Platform.',
            'No attempt to bypass access controls, safeguards, or billing mechanisms.',
        ],
    },
    {
        title: '12. Third-party links and services',
        paragraphs: [
            'The Platform may include third-party links, products, or integrations. We do not control third-party services and are not responsible for their content, performance, or policies.',
        ],
    },
    {
        title: '13. Intellectual property',
        paragraphs: [
            'Onya Health owns or licenses the Platform content, branding, software, and related materials. You receive a limited, revocable, non-transferable right to use the Platform for personal, lawful purposes.',
            'You must not copy, distribute, modify, or commercially exploit our content without prior written consent.',
        ],
    },
    {
        title: '14. Privacy and records',
        paragraphs: [
            'Our handling of personal and health information is described in our Privacy Policy.',
            'Practitioners and partner providers may maintain clinical records in accordance with their legal and professional obligations.',
        ],
    },
    {
        title: '15. Limitation of liability',
        paragraphs: [
            'To the extent permitted by law, the Platform is provided on an “as available” basis and we exclude implied warranties not capable of exclusion.',
            'To the extent permitted by law, we are not liable for indirect or consequential losses, loss of profits, or losses arising from the acts or omissions of independent practitioners or third-party providers.',
            'Where liability cannot be excluded under law, our liability is limited to the minimum extent permitted by law.',
        ],
    },
    {
        title: '16. Suspension or termination',
        paragraphs: [
            'We may suspend or terminate access where required for safety, security, legal compliance, non-payment, or breach of these Terms.',
            'You may stop using the Platform at any time. Any outstanding fees remain payable.',
        ],
    },
    {
        title: '17. Changes to these Terms',
        paragraphs: [
            'We may update these Terms from time to time. The latest version is published on this page with the updated date shown below.',
        ],
    },
    {
        title: '18. Governing law',
        paragraphs: [
            'These Terms are governed by the laws of New South Wales, Australia, and the parties submit to the non-exclusive jurisdiction of the courts of New South Wales.',
        ],
    },
];

export default function TermsConditionsPage() {
    useEffect(() => {
        document.title = 'Terms & Conditions | Onya Health';
        const descriptionTag = document.querySelector('meta[name="description"]');
        if (descriptionTag) {
            descriptionTag.setAttribute(
                'content',
                'Read the Onya Health Terms & Conditions governing platform access, service requests, account use, fees, and legal rights.'
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
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-secondary">Terms & conditions</p>
                    <h1 className="mt-4 text-4xl font-bold leading-tight text-text-primary md:text-5xl">Onya Health User Terms</h1>
                    <p className="mt-4 text-base leading-relaxed text-text-secondary">
                        These Terms apply to your use of the Onya Health Platform and services operated by {COMPANY_NAME} (ABN {COMPANY_ABN}).
                    </p>
                    <p className="mt-3 text-sm font-medium text-text-primary">Last updated: {LAST_UPDATED}</p>
                </div>
            </section>

            <section className="bg-surface">
                <div className="mx-auto w-full max-w-4xl px-4 py-12 md:px-6 md:py-14">
                    <div className="space-y-8">
                        {TERMS_SECTIONS.map((section) => (
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
                            Questions about these Terms can be sent to{' '}
                            <a className="font-medium text-primary hover:underline" href="mailto:hello@onyahealth.com.au">
                                hello@onyahealth.com.au
                            </a>
                            .
                        </p>
                    </div>
                </div>
            </section>

            <Footer consultHref="/doctor" />
        </main>
    );
}
