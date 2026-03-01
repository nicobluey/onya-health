import { useEffect, useState } from 'react';
import { ArrowRight, Grid2x2, X } from 'lucide-react';
import { SERVICE_LIST } from './services';
import { LiveActivityToast } from './components/LiveActivityToast';
import { FAQ } from './components/FAQ';
import { BlogsSection, UsedByPatientsSection } from './components/LandingExtras';
import { Footer } from './components/Footer';
import { HomeReviews } from './components/HomeReviews';
import { HowItWorks } from './components/HowItWorks';

const ROTATING_PROVIDERS = ['doctor', 'nutritionist', 'psychologist'];
const HOME_THEME = {
    pageBg: '#ffffff',
    heroBg: '#58a8ff',
};

const HOME_STATS = [
    { value: '24/7', label: 'Care Available' },
    { value: '500+', label: 'Verified Doctors' },
    { value: '30,000+', label: 'Patients Treated' },
];

const HOME_CARD_CTA_BY_SLUG: Record<string, string> = {
    doctor: 'Talk to a doctor',
    nutritionist: 'Talk to a nutritionist',
    psychologist: 'Talk to a psychologist',
};

const HOME_CARD_IMAGE_BY_SLUG: Record<string, string> = {
    doctor: '/doctor-consult.png',
    nutritionist: '/nutrionist.png',
    psychologist: '/psychologist.png',
};

export default function HomeHub() {
    const [wordIndex, setWordIndex] = useState(0);
    const [displayWord, setDisplayWord] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    useEffect(() => {
        const currentWord = ROTATING_PROVIDERS[wordIndex];
        const reachedWordEnd = displayWord === currentWord;
        const reachedWordStart = displayWord.length === 0;
        const delay = !isDeleting && reachedWordEnd
            ? 1000
            : isDeleting && reachedWordStart
                ? 280
                : isDeleting
                    ? 50
                    : 90;

        const timer = setTimeout(() => {
            if (!isDeleting) {
                if (reachedWordEnd) {
                    setIsDeleting(true);
                    return;
                }
                setDisplayWord(currentWord.slice(0, displayWord.length + 1));
                return;
            }

            if (!reachedWordStart) {
                setDisplayWord(currentWord.slice(0, displayWord.length - 1));
                return;
            }

            setIsDeleting(false);
            setWordIndex((prev) => (prev + 1) % ROTATING_PROVIDERS.length);
        }, delay);

        return () => clearTimeout(timer);
    }, [displayWord, isDeleting, wordIndex]);

    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: HOME_THEME.pageBg }}>
            <header className="sticky top-0 z-50 w-full border-b border-white/30 bg-white/30 shadow-sm backdrop-blur-xl">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <a
                        href="/"
                        className="font-serif font-bold text-2xl md:text-3xl tracking-tight text-text-primary flex items-center gap-2 md:gap-3"
                        aria-label="Go to home page"
                    >
                        <img src="/logo.png" alt="Onya Health" className="h-11 md:h-14 w-auto object-contain scale-110 origin-left" />
                        <span className="sr-only">Onya Health</span>
                    </a>
                    <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        className="h-10 w-10 rounded-xl text-text-primary/90 flex items-center justify-center hover:bg-white/30 transition-colors"
                        aria-label="Toggle navigation"
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? <X size={18} /> : <Grid2x2 size={18} />}
                    </button>
                </div>
                {menuOpen && (
                    <nav className="border-t border-white/40 bg-white/70 backdrop-blur-xl px-4 md:px-8 pb-4">
                        <div className="pt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                            <a href="/patient-login" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Patient Login</a>
                            <a href="/doctor" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Doctor</a>
                            <a href="/nutritionist" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Nutritionist</a>
                            <a href="/psychologist" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Psychologist</a>
                            <a href="#for-physicians" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">For Physicians</a>
                            <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">How it works</a>
                            <a href="#faq" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">FAQ</a>
                        </div>
                    </nav>
                )}
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden pb-12 pt-24 md:min-h-[640px] md:pb-32 md:pt-28" style={{ backgroundColor: HOME_THEME.heroBg }}>
                    <div className="absolute inset-0">
                        <img
                            src="/HERO.png"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                            style={{ objectPosition: '58% 76%' }}
                        />
                    </div>
                    <div className="max-w-7xl mx-auto px-5 md:px-8 text-center relative z-10">
                        <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                            Healthcare made for you
                        </h1>
                        <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                            Smart matching connects you with the right doctor, nutritionist, or psychologist fast, so quality care feels simpler and more affordable.
                        </p>
                        <div className="mt-5 text-white text-2xl md:text-4xl font-serif font-bold h-12 md:h-14">
                            <span className="capitalize">{displayWord}</span>
                            <span className="animate-pulse ml-1">|</span>
                        </div>
                    </div>
                </section>

                <div className="bg-white border-b border-border py-4 overflow-hidden">
                    <div className="max-w-7xl mx-auto px-6 md:px-8">
                        <div className="grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                            <div className="grid grid-cols-3 gap-5">
                                {HOME_STATS.map((item) => (
                                    <div key={item.label}>
                                        <p className="text-3xl font-bold leading-none text-text-primary">{item.value}</p>
                                        <p className="mt-1 text-xs font-medium text-bark-500">{item.label}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                                AI-guided matching helps you find the right clinician faster, with affordable pricing and trusted quality care across Australia.
                            </p>
                        </div>
                    </div>
                </div>

                <section id="ai-match-specialties" className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="text-3xl font-serif font-bold text-center text-text-primary mb-10">
                        AI-matched care by specialty
                    </h2>
                    <p className="mx-auto mb-8 max-w-3xl text-center text-base text-text-secondary">
                        Tell us what you need and Onya routes you to the most suitable clinician for your situation.
                    </p>
                    <div className="grid gap-6 md:grid-cols-3 items-stretch">
                        {SERVICE_LIST.map((service) => (
                            <a
                                key={service.slug}
                                href={`/${service.slug}`}
                                className="bg-white rounded-3xl border border-border p-5 md:p-6 shadow-sm h-full flex flex-col hover:shadow-md transition-shadow"
                                aria-label={`Open ${service.providerName} landing page`}
                            >
                                <div
                                    className="h-60 overflow-hidden rounded-2xl border border-white/50 flex items-center justify-center text-text-primary font-semibold text-sm md:h-64 md:text-base text-center"
                                    style={{ backgroundColor: service.theme.cardTint }}
                                >
                                    {HOME_CARD_IMAGE_BY_SLUG[service.slug] ? (
                                        <img
                                            src={HOME_CARD_IMAGE_BY_SLUG[service.slug]}
                                            alt={`${service.providerName} preview`}
                                            className="h-full w-full object-cover"
                                            loading="lazy"
                                        />
                                    ) : (
                                        service.placeholderLabel
                                    )}
                                </div>
                                <h3 className="font-serif text-2xl font-bold text-text-primary mt-5 capitalize">
                                    {service.homeTitle}
                                </h3>
                                <p className="text-text-secondary mt-3 leading-relaxed min-h-[7rem]">
                                    {service.homeBody}
                                </p>
                                <div
                                    className="mt-auto inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-white font-semibold text-center"
                                    style={{ backgroundColor: service.theme.primary }}
                                >
                                    {HOME_CARD_CTA_BY_SLUG[service.slug] ?? service.primaryCta}
                                    <ArrowRight size={16} />
                                </div>
                            </a>
                        ))}
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks />
                </div>

                <UsedByPatientsSection />

                <HomeReviews />

                <BlogsSection />

                <section id="faq" className="bg-white py-8">
                    <FAQ />
                </section>
            </main>

            <div className="hidden md:block">
                <LiveActivityToast />
            </div>
            <div className="md:hidden">
                <LiveActivityToast mobile />
            </div>
            <Footer consultHref="/doctor" />
        </div>
    );
}
