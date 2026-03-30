import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { SERVICE_LIST } from '../consult-flow';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

const ROTATING_PROVIDERS = ['doctor', 'nutritionist', 'psychologist'];
const HOME_THEME = {
    pageBg: '#ffffff',
    heroBg: '#58a8ff',
};

const HOME_HIGHLIGHTS = [
    { title: 'Fast', detail: 'Online assessment' },
    { title: 'Trusted', detail: 'Practitioner reviewed' },
    { title: 'Personalised', detail: 'Care matched to your needs' },
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

export default function HomePage() {
    const [wordIndex, setWordIndex] = useState(0);
    const [displayWord, setDisplayWord] = useState('');
    const [isDeleting, setIsDeleting] = useState(false);
    const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

    useEffect(() => {
        const handleScroll = () => {
            setIsHeaderScrolled(window.scrollY > 18);
        };

        handleScroll();
        window.addEventListener('scroll', handleScroll, { passive: true });
        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

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
            <header className={`sticky top-0 z-50 w-full border-b transition-all duration-300 ${isHeaderScrolled ? 'border-white/45 bg-white/65 shadow-[0_10px_28px_rgba(15,23,42,0.12)] backdrop-blur-xl' : 'border-border bg-white shadow-sm'}`}>
                <div className="mx-auto flex h-16 w-full max-w-[84rem] items-center justify-between px-4 md:px-8">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
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
                        <div className="-mt-4 md:-mt-5">
                            <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                                Healthcare made for you
                            </h1>
                            <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                                Online care that feels simpler, safer, and more connected.
                            </p>
                        </div>
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
                                {HOME_HIGHLIGHTS.map((item) => (
                                    <div key={item.title}>
                                        <p className="text-2xl font-bold leading-none text-text-primary">{item.title}</p>
                                        <p className="mt-1 text-xs font-medium text-bark-500">{item.detail}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                                Access care faster through a tailored online experience that connects you with the right support across Australia.
                            </p>
                        </div>
                    </div>
                </div>

                <section id="ai-match-specialties" className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="text-3xl font-serif font-bold text-center text-text-primary mb-10">
                        Support matched to the care you need
                    </h2>
                    <p className="mx-auto mb-8 max-w-3xl text-center text-base text-text-secondary">
                        Tell us what you need and Onya routes you to the most suitable clinician for your situation.
                    </p>
                    <div className="grid gap-6 md:grid-cols-3 items-stretch">
                        {SERVICE_LIST.map((service) => (
                            <a
                                key={service.slug}
                                href={`/${service.slug}`}
                                className="relative overflow-hidden bg-white rounded-3xl border border-border p-5 md:p-6 shadow-sm h-full flex flex-col hover:shadow-md transition-shadow"
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
                                {(service.slug === 'nutritionist' || service.slug === 'psychologist') && (
                                    <div className="pointer-events-none absolute inset-0 overflow-hidden">
                                        <span className="absolute bottom-[34px] right-[-116px] block w-[22rem] rotate-[-42deg] border border-amber-300 bg-[#FDE68A] py-3 text-center text-xs font-extrabold uppercase tracking-[0.16em] text-bark-900 shadow-[0_12px_24px_rgba(15,23,42,0.32)]">
                                            Coming soon
                                        </span>
                                    </div>
                                )}
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

            <Footer consultHref="/doctor" />
        </div>
    );
}
