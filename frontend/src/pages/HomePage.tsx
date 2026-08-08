import { ArrowRight, BriefcaseBusiness, CheckCircle2, GraduationCap, HeartHandshake } from 'lucide-react';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

const HERO_POINTS = [
    '1-day requests from $11.21',
    'No clinic queue for suitable cases',
    'Work, uni, and carer leave',
];

const HOME_HIGHLIGHTS = [
    { label: '$11.21', detail: 'For a 1-day request' },
    { label: '24/7', detail: 'Start when symptoms hit' },
    { label: 'Online', detail: 'Doctor-reviewed outcome' },
];

const CERTIFICATE_OPTIONS = [
    {
        title: 'Work',
        label: 'Too sick to work',
        body: 'Start a sick-leave request online when your employer needs evidence for a short absence.',
        image: '/generated/medcert-work.webp',
        href: '/work',
        icon: BriefcaseBusiness,
    },
    {
        title: 'Student',
        label: 'Study disrupted',
        body: 'For missed class, exams, placements, or assessment deadlines when illness gets in the way.',
        image: '/generated/medcert-student.webp',
        href: '/student',
        icon: GraduationCap,
    },
    {
        title: 'Carer',
        label: 'Someone needs you',
        body: 'For carer or parent leave when a child, family member, or person under your care is unwell.',
        image: '/generated/medcert-carer.webp',
        href: '/caretaker',
        icon: HeartHandshake,
    },
];

export default function HomePage() {
    return (
        <div className="flex min-h-screen flex-col bg-white font-sans text-text-primary">
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:px-8">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden bg-[#06142b]">
                    <div className="absolute inset-0">
                        <img
                            src="/generated/medcert-hero.webp"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover object-[58%_center] md:object-center"
                        />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,20,43,0.94)_0%,rgba(6,20,43,0.78)_48%,rgba(6,20,43,0.58)_100%)] md:bg-[linear-gradient(90deg,rgba(6,20,43,0.95)_0%,rgba(6,20,43,0.78)_38%,rgba(6,20,43,0.28)_68%,rgba(6,20,43,0.04)_100%)]" />

                    <div className="relative z-10 mx-auto flex min-h-[calc(100svh-64px)] max-w-7xl items-center px-5 py-10 md:min-h-[720px] md:px-8 md:py-20">
                        <div className="max-w-[760px]">
                            <p className="onya-kicker border-white/20 bg-white/10 text-white">Medical certificates online</p>
                            <h1 className="onya-display mt-5 max-w-[10ch] text-white">
                                Need a medical certificate today?
                            </h1>
                            <p className="mt-5 max-w-[600px] text-lg font-bold leading-relaxed text-white/88 md:text-xl">
                                Skip the waiting room admin. Tell us what is going on, choose your dates, and get a doctor-reviewed outcome online. If approved, your certificate is sent digitally.
                            </p>

                            <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                                <a href="/doctor#book" className="onya-button bg-white text-[#06142b] hover:bg-[#edf2ff]">
                                    Start from $11.21
                                    <ArrowRight size={18} />
                                </a>
                                <a href="#certificate-options" className="onya-button-secondary border-white/20 bg-white/10 text-white hover:bg-white/18">
                                    Work, uni, or carer?
                                </a>
                            </div>

                            <div className="mt-7 grid gap-2 text-sm font-bold text-white/88 sm:grid-cols-3">
                                {HERO_POINTS.map((point) => (
                                    <div key={point} className="flex min-w-0 items-center gap-2">
                                        <CheckCircle2 size={17} className="shrink-0 text-[#74d6a2]" />
                                        <span>{point}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>

                <div className="border-y border-border bg-white">
                    <div className="mx-auto grid max-w-7xl gap-4 px-5 py-4 md:grid-cols-[1fr_auto] md:items-center md:px-8">
                        <div className="grid gap-3 sm:grid-cols-3">
                            {HOME_HIGHLIGHTS.map((item) => (
                                <div key={item.label} className="min-w-0 border-l-2 border-primary pl-3">
                                    <p className="font-serif text-3xl font-extrabold leading-none text-[#06142b]">{item.label}</p>
                                    <p className="mt-1 text-sm font-semibold text-text-secondary">{item.detail}</p>
                                </div>
                            ))}
                        </div>
                        <p className="max-w-xl text-sm font-semibold leading-relaxed text-text-secondary">
                            You are paying for a doctor-reviewed request. Certificates are issued only where clinically appropriate.
                        </p>
                    </div>
                </div>

                <section id="certificate-options" className="scroll-mt-24 bg-[#f5f7fa]">
                    <div className="onya-section mx-auto max-w-7xl px-5 md:px-8">
                        <div className="grid gap-5 md:grid-cols-[0.9fr_1.1fr] md:items-end">
                            <div>
                                <p className="onya-kicker">Choose your path</p>
                                <h2 className="onya-heading-xl mt-4 max-w-[12ch] text-[#06142b]">
                                    Tell the doctor what this is for.
                                </h2>
                            </div>
                            <p className="max-w-2xl text-base font-semibold leading-relaxed text-text-secondary md:justify-self-end md:text-lg">
                                Work, uni, and carer leave ask for different context. Pick the one that matches your situation so the review starts with the right details.
                            </p>
                        </div>

                        <div className="mt-8 grid gap-4 md:grid-cols-3">
                            {CERTIFICATE_OPTIONS.map((option) => {
                                const Icon = option.icon;
                                return (
                                    <article key={option.title} className="onya-tile group flex h-full flex-col">
                                        <a href={option.href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
                                            <div className="aspect-[4/3] overflow-hidden bg-[#eef4fb]">
                                                <img
                                                    src={option.image}
                                                    alt=""
                                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                                                    loading="lazy"
                                                />
                                            </div>
                                        </a>
                                        <div className="flex flex-1 flex-col p-4 md:p-5">
                                            <div className="flex items-center justify-between gap-3">
                                                <p className="text-sm font-extrabold uppercase text-primary">{option.title}</p>
                                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#eef4fb] text-primary">
                                                    <Icon size={18} />
                                                </span>
                                            </div>
                                            <h3 className="mt-2 text-2xl font-extrabold leading-none text-[#06142b]">{option.label}</h3>
                                            <p className="mt-3 flex-1 text-sm font-medium leading-relaxed text-text-secondary">{option.body}</p>
                                            <a href={option.href} className="onya-button mt-5 w-full">
                                                Start this request
                                                <ArrowRight size={16} />
                                            </a>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks serviceSlug="doctor" />
                </div>

                <UsedByPatientsSection />
                <HomeReviews />
                <BlogsSection />

                <section id="faq" className="bg-white py-8">
                    <FAQ />
                </section>
            </main>

            <Footer consultHref="/doctor#book" />
        </div>
    );
}
