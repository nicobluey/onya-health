import { ArrowRight, Instagram, Linkedin, Mail } from 'lucide-react';
import { Button } from './UI';

interface FooterProps {
    onStartConsult?: () => void;
    consultHref?: string;
}

interface FooterLinkGroup {
    title: string;
    links: Array<{ label: string; href: string }>;
}

const FOOTER_GROUPS: FooterLinkGroup[] = [
    {
        title: 'Certificates',
        links: [
            { label: 'Medical certificates', href: '/doctor' },
            { label: 'Work certificates', href: '/medical-certificate-work' },
            { label: 'University certificates', href: '/medical-certificate-university' },
            { label: "Carer's leave certificates", href: '/medical-certificate-carers-leave' },
        ],
    },
    {
        title: 'Care',
        links: [
            { label: 'Start online consult', href: '/doctor' },
            { label: 'Patient login', href: '/patient-login' },
            { label: 'How it works', href: '#how-it-works' },
            { label: 'Fair Work guidance', href: '/fair-work-medical-certificates' },
        ],
    },
    {
        title: 'Company',
        links: [
            { label: 'About Onya Health', href: '/about' },
            { label: 'Patient login', href: '/patient-login' },
            { label: 'Verify certificate', href: '/verify' },
            { label: 'Blog', href: '/blog' },
            { label: 'Contact', href: 'mailto:hello@onyahealth.com.au' },
        ],
    },
    {
        title: 'Support',
        links: [
            { label: 'FAQ', href: '#faq' },
            { label: 'Privacy', href: '/privacy' },
            { label: 'Terms', href: '/terms' },
            { label: 'Trust & safety', href: '/trust' },
        ],
    },
];

const TRUST_LINE_ITEMS = [
    'Australia-wide access',
    'Doctor reviewed',
    'Secure digital delivery',
];

const FOOTER_LINK_CLASS_NAME = 'text-[0.93rem] text-bark-700 underline-offset-4 transition-colors hover:text-bark-900 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8] rounded-sm';

export function Footer({ onStartConsult, consultHref = '/doctor' }: FooterProps) {
    return (
        <section className="w-full border-t border-[#e6ddcf] bg-[linear-gradient(180deg,#fdf9f3_0%,#faf4ea_62%,#f7efe3_100%)] text-bark-800">
            <footer className="mx-auto w-full max-w-[84rem] px-6 pb-6 pt-8 md:px-10 md:pb-8 md:pt-10 lg:px-14">
                <div className="mx-auto w-full max-w-[68rem]">
                    <div className="border-b border-[#e9dfcf] pb-6">
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(15.5rem,auto)] lg:items-center lg:gap-5">
                        <div>
                            <a
                                href="/"
                                className="inline-flex items-center rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8]"
                                aria-label="Onya Health home"
                            >
                                <img src="/onya-health-logo.png" alt="Onya Health" className="h-10 w-auto" />
                            </a>
                            <h2 className="mt-1.5 max-w-[35rem] text-[1.58rem] font-serif font-bold leading-[1.15] md:text-[1.72rem]">
                                <span className="block text-bark-800">Healthcare that works around you.</span>
                                <span className="block font-semibold text-bark-600">Clear, secure care built for real life.</span>
                            </h2>
                        </div>

                        <div className="w-full max-w-[15.5rem] rounded-xl border border-[#e7dbc8]/90 bg-white/55 p-3.5">
                            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-bark-500">Ready to get started?</p>
                            {onStartConsult ? (
                                <Button onClick={onStartConsult} className="mt-2.5 h-12 w-full rounded-xl px-5 text-[15px]">
                                    Start online consult
                                    <ArrowRight size={16} className="ml-2" />
                                </Button>
                            ) : (
                                <a
                                    href={consultHref}
                                    className="mt-2.5 inline-flex h-12 w-full items-center justify-center rounded-xl bg-primary px-5 text-[15px] font-semibold text-sand-50 transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8]"
                                >
                                    Start online consult
                                    <ArrowRight size={16} className="ml-2" />
                                </a>
                            )}
                            <p className="mt-2 text-[12px] leading-relaxed text-bark-600">
                                Australia-wide doctor-reviewed care with digital delivery
                            </p>
                        </div>
                    </div>

                        <div className="mt-4 border-y border-[#e9dfcf] py-2.5">
                        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] text-bark-600 md:text-sm">
                            {TRUST_LINE_ITEMS.map((item, index) => (
                                <li key={item} className="inline-flex items-center gap-3 font-medium">
                                    {index > 0 && <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#b7aa93]" />}
                                    <span>{item}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    </div>

                    <div className="grid grid-cols-2 gap-x-7 gap-y-7 py-6 md:grid-cols-4 md:gap-x-8 md:gap-y-8">
                        {FOOTER_GROUPS.map((group) => (
                            <nav key={group.title} aria-label={`${group.title} links`}>
                                <h3 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-bark-500">{group.title}</h3>
                                <ul className="mt-3 space-y-2.5">
                                    {group.links.map((link) => (
                                        <li key={link.label}>
                                            <a href={link.href} className={FOOTER_LINK_CLASS_NAME}>
                                                {link.label}
                                            </a>
                                        </li>
                                    ))}
                                </ul>
                            </nav>
                        ))}
                    </div>

                    <div className="grid gap-4 border-t border-[#e9dfcf] pt-4 text-[11px] text-bark-500 md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] md:items-center md:text-xs">
                        <p className="max-w-lg leading-relaxed text-bark-500/95">
                            We acknowledge Aboriginal and Torres Strait Islander peoples as the Traditional Custodians of Country throughout Australia and pay respect to Elders past and present.
                        </p>

                        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 md:justify-center" aria-label="Social and contact links">
                            <a
                                href="https://www.instagram.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-bark-600 transition-colors hover:text-bark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8] rounded-sm"
                                aria-label="Follow Onya Health on Instagram"
                            >
                                <Instagram size={14} />
                                Instagram
                            </a>
                            <a
                                href="https://www.linkedin.com"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-bark-600 transition-colors hover:text-bark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8] rounded-sm"
                                aria-label="Follow Onya Health on LinkedIn"
                            >
                                <Linkedin size={14} />
                                LinkedIn
                            </a>
                            <a
                                href="mailto:hello@onyahealth.com.au"
                                className="inline-flex items-center gap-1.5 text-bark-600 transition-colors hover:text-bark-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-[#f9f3e8] rounded-sm"
                                aria-label="Email Onya Health support"
                            >
                                <Mail size={14} />
                                hello@onyahealth.com.au
                            </a>
                        </div>

                        <p className="text-left leading-relaxed md:text-right">
                            © {new Date().getFullYear()} Onya Health Pty Ltd
                            <br />
                            ABN information available on request.
                        </p>
                    </div>
                </div>
            </footer>
        </section>
    );
}
