import { useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';
import { MagneticButton } from '../components/lightswind/MagneticButton';

type UseCaseKey = 'doctor' | 'student' | 'caretaker' | 'work';
type PurposeParam = 'work' | 'university' | 'carers-leave' | null;

interface UseCaseConfig {
    key: UseCaseKey;
    path: string;
    aliases?: string[];
    title: string;
    subtitle: string;
    heroImage: string;
    heroObjectClass: string;
    heroImageAlt: string;
    cardTitle: string;
    cardBody: string;
    cardCta: string;
    cardImageClass: string;
    purposeParam: PurposeParam;
    metaTitle: string;
    metaDescription: string;
}

const USE_CASES: UseCaseConfig[] = [
    {
        key: 'doctor',
        path: '/doctor',
        aliases: ['/medical-certificate-doctor'],
        title: 'Medical certificates from $9 delivered instantly',
        subtitle: '1 day certificates are $9.71, then linearly scale up to $29.71 by days 5-7, or choose All Access for $19/month.',
        heroImage: '/Medical Certificate Landing.webp',
        heroObjectClass: 'object-[64%_44%] md:object-[52%_44%]',
        heroImageAlt: 'Doctor reviewing an online medical certificate request',
        cardTitle: 'Doctor certificates',
        cardBody: 'Doctor-reviewed certificate requests with pricing at $9.71 for 1 day and instant digital delivery if approved.',
        cardCta: 'Book now',
        cardImageClass: 'object-[62%_44%]',
        purposeParam: null,
        metaTitle: 'Medical Certificates from $9 Delivered Instantly | Onya Health',
        metaDescription: 'Medical certificates from $9 delivered instantly online ($9.71 for 1 day), then linearly scaled up to $29.71 for 5-7 days. Or choose All Access at $19/month. Doctor-reviewed in Australia.',
    },
    {
        key: 'student',
        path: '/student',
        aliases: ['/medical-certificate-student', '/medical-certificate-university'],
        title: 'Student medical certificates for classes and assessments',
        subtitle: 'Request evidence quickly when illness affects classes, exams, or assignment deadlines.',
        heroImage: '/student2.webp',
        heroObjectClass: 'object-[50%_42%] md:object-[50%_40%]',
        heroImageAlt: 'Student completing a medical certificate request online',
        cardTitle: 'Student certificates',
        cardBody: 'Built for university and school documentation when illness affects study.',
        cardCta: 'Book now',
        cardImageClass: 'object-[50%_42%]',
        purposeParam: 'university',
        metaTitle: 'Student Medical Certificates | $9.71 for 1 Day | Onya Health',
        metaDescription: 'Online student medical certificates at $9.71 for 1 day with doctor review and instant digital delivery if approved.',
    },
    {
        key: 'caretaker',
        path: '/caretaker',
        aliases: ['/ca', '/medical-certificate-caretaker', '/medical-certificate-carers-leave'],
        title: 'Carer and parent leave certificates online',
        subtitle: 'Request leave documentation when you need to care for someone under your care.',
        heroImage: '/parents.webp',
        heroObjectClass: 'object-[54%_44%] md:object-[50%_46%]',
        heroImageAlt: 'Parent-focused carer leave support banner',
        cardTitle: 'Carer certificates',
        cardBody: 'Documentation support for carer responsibilities and family care scenarios.',
        cardCta: 'Book now',
        cardImageClass: 'object-[52%_46%]',
        purposeParam: 'carers-leave',
        metaTitle: 'Carer Medical Certificates | $9.71 for 1 Day | Onya Health',
        metaDescription: 'Online carer leave certificates at $9.71 for 1 day with secure doctor-reviewed outcomes and instant digital delivery if approved.',
    },
    {
        key: 'work',
        path: '/work',
        aliases: ['/medical-certificate-work'],
        title: 'Work medical certificates for sick leave',
        subtitle: 'Request work absence documentation online without waiting room delays.',
        heroImage: '/woman_office_worker.webp',
        heroObjectClass: 'object-[68%_42%] md:object-[56%_44%]',
        heroImageAlt: 'Worker requesting a medical certificate online',
        cardTitle: 'Work certificates',
        cardBody: 'Sick leave documentation requests for common workplace absence needs.',
        cardCta: 'Book now',
        cardImageClass: 'object-[66%_42%]',
        purposeParam: 'work',
        metaTitle: 'Work Medical Certificates | $9.71 for 1 Day | Onya Health',
        metaDescription: 'Online work medical certificates at $9.71 for 1 day with doctor review and instant digital delivery if approved.',
    },
];

function getUseCaseByPath(pathname: string): UseCaseConfig {
    const normalizedPath = pathname.toLowerCase();
    for (const config of USE_CASES) {
        if (config.path === normalizedPath) return config;
        if (config.aliases?.includes(normalizedPath)) return config;
    }
    return USE_CASES[0];
}

export default function MedicalCertificateUseCasePage() {
    const pathname = window.location.pathname.toLowerCase();
    const currentUseCase = useMemo(() => getUseCaseByPath(pathname), [pathname]);
    const bookingHref = '/doctor#book';

    useEffect(() => {
        document.title = currentUseCase.metaTitle;
        const updateMeta = (selector: string, value: string) => {
            const tag = document.querySelector(selector);
            if (tag) {
                tag.setAttribute('content', value);
            }
        };

        updateMeta('meta[name="description"]', currentUseCase.metaDescription);
        updateMeta('meta[property="og:title"]', currentUseCase.metaTitle);
        updateMeta('meta[property="og:description"]', currentUseCase.metaDescription);
        updateMeta('meta[name="twitter:title"]', currentUseCase.metaTitle);
        updateMeta('meta[name="twitter:description"]', currentUseCase.metaDescription);
    }, [currentUseCase.metaDescription, currentUseCase.metaTitle]);

    return (
        <div className="min-h-screen flex flex-col font-sans bg-white">
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden pb-12 pt-24 md:min-h-[640px] md:pb-28 md:pt-28">
                    <div className="absolute inset-0">
                        <img
                            src={currentUseCase.heroImage}
                            alt={currentUseCase.heroImageAlt}
                            className={`h-full w-full object-cover ${currentUseCase.heroObjectClass}`}
                        />
                        <div className="absolute inset-0 bg-bark-900/28" />
                    </div>

                    <div className="relative z-10 max-w-6xl mx-auto px-5 md:px-8 text-center">
                        <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.08] text-white tracking-tight">
                            {currentUseCase.title}
                        </h1>
                        <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                            {currentUseCase.subtitle}
                        </p>
                        <div className="mt-8 inline-flex">
                            <MagneticButton
                                variant="primary"
                                size="lg"
                                strength={0.46}
                                radius={112}
                                className="rounded-2xl px-8 shadow-lg"
                                onClick={() => {
                                    window.location.href = bookingHref;
                                }}
                                aria-label="Start certificate consult"
                            >
                                Book now
                                <ArrowRight size={18} />
                            </MagneticButton>
                        </div>
                        <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                            <span className="inline-flex rounded-full border border-white/40 bg-white/90 px-3 py-1 text-xs font-semibold tracking-[0.08em] text-text-primary">
                                <span className="relative mr-2 flex h-2.5 w-2.5">
                                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                                </span>
                                Doctors online now
                            </span>
                        </div>
                        <p className="mx-auto mt-2 max-w-2xl text-xs font-medium text-white/90">
                            Medical certificates from $9 delivered instantly online ($9.71 for 1 day).
                        </p>
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks />
                </div>

                <section id="ai-match-specialties" className="relative overflow-hidden max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="relative z-10 text-3xl font-serif font-bold text-center text-text-primary mb-10">
                        Support matched to the care you need
                    </h2>
                    <p className="relative z-10 mx-auto mb-8 max-w-3xl text-center text-base text-text-secondary">
                        Choose the certificate use case that matches your situation.
                    </p>

                    <div className="relative z-10 grid gap-6 md:grid-cols-2 xl:grid-cols-4 items-stretch">
                        {USE_CASES.map((useCase) => {
                            const selected = useCase.key === currentUseCase.key;
                            return (
                                <article
                                    key={useCase.key}
                                    className={`rounded-3xl border p-5 md:p-6 shadow-sm h-full flex flex-col transition-all ${
                                        selected
                                            ? 'border-primary bg-sunlight-50/70 shadow-[0_20px_42px_-34px_rgba(46,140,255,0.72)]'
                                            : 'border-border bg-white hover:shadow-md'
                                    }`}
                                >
                                    <div className="h-56 overflow-hidden rounded-2xl border border-white/50 md:h-60">
                                        <img
                                            src={useCase.heroImage}
                                            alt={useCase.heroImageAlt}
                                            className={`h-full w-full object-cover ${useCase.cardImageClass}`}
                                            loading="lazy"
                                        />
                                    </div>
                                    <h3 className="font-serif text-2xl font-bold text-text-primary mt-5 capitalize">
                                        {useCase.cardTitle}
                                    </h3>
                                    <p className="text-text-secondary mt-3 leading-relaxed min-h-[5.8rem]">
                                        {useCase.cardBody}
                                    </p>
                                    <div className="mt-auto">
                                        <MagneticButton
                                            variant={selected ? 'primary' : 'secondary'}
                                            size="lg"
                                            strength={0.46}
                                            radius={112}
                                            edgePadding={12}
                                            className="w-full rounded-xl text-center"
                                            onClick={() => {
                                                window.location.href = useCase.path;
                                            }}
                                            aria-label={useCase.cardCta}
                                        >
                                            {selected ? 'Viewing' : useCase.cardCta}
                                            <ArrowRight size={16} />
                                        </MagneticButton>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <UsedByPatientsSection />
                <HomeReviews />
                <BlogsSection />

                <section id="faq" className="bg-white py-8">
                    <FAQ />
                </section>
            </main>

            <Footer consultHref={bookingHref} />
        </div>
    );
}
