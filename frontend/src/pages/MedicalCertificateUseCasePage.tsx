import { useEffect, useMemo } from 'react';
import { ArrowRight } from 'lucide-react';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';

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
        title: 'Request a medical certificate online',
        subtitle: 'Complete a short online form for Australian doctor review. Certificates are issued digitally where clinically appropriate.',
        heroImage: '/Medical Certificate Landing.webp',
        heroObjectClass: 'object-[64%_44%] md:object-[52%_44%]',
        heroImageAlt: 'Doctor reviewing an online medical certificate request',
        cardTitle: 'Doctor certificates',
        cardBody: 'Doctor-reviewed certificate requests with digital delivery where clinically appropriate.',
        cardCta: 'Book now',
        cardImageClass: 'object-[62%_44%]',
        purposeParam: null,
        metaTitle: 'Request a Medical Certificate Online | $9.71 for 1 Day | Onya Health',
        metaDescription: 'Request a medical certificate online for $9.71 for 1 day, then linearly scaled up to $29.71 for 5-7 days. Australian doctor review required; issued where clinically appropriate.',
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
        metaDescription: 'Request an online student medical certificate for $9.71 for 1 day with Australian doctor review and digital delivery where clinically appropriate.',
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
        metaDescription: 'Request an online carer leave certificate for $9.71 for 1 day with secure Australian doctor review and digital delivery where clinically appropriate.',
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
        metaDescription: 'Request an online work medical certificate for $9.71 for 1 day with Australian doctor review and digital delivery where clinically appropriate.',
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
                <section className="relative overflow-hidden bg-[#f3f8ff]">
                    <div className="absolute inset-0">
                        <img
                            src={currentUseCase.heroImage}
                            alt={currentUseCase.heroImageAlt}
                            className={`h-full w-full object-cover ${currentUseCase.heroObjectClass}`}
                        />
                    </div>

                    <div className="relative z-10 mx-auto flex min-h-[calc(100svh-64px)] max-w-7xl items-center px-5 py-10 md:min-h-[640px] md:px-8 md:py-20">
                        <div className="max-w-[740px]">
                        <p className="onya-kicker bg-white/95">$9.71 one-day request</p>
                        <h1 className="onya-display mt-5 max-w-[10ch] text-[#06142b]">
                            {currentUseCase.title}
                        </h1>
                        <p className="mt-5 max-w-[620px] text-lg font-semibold leading-relaxed text-[#06142b] md:text-xl">
                            {currentUseCase.subtitle}
                        </p>
                        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                            <a href={bookingHref} className="onya-button">
                                Start certificate request
                                <ArrowRight size={18} />
                            </a>
                            <a href="#certificate-options" className="onya-button-secondary">
                                Compare types
                            </a>
                        </div>
                        <p className="mt-4 max-w-[560px] text-sm font-bold text-[#06142b]">
                            Doctor review is required. Certificates are issued only where clinically appropriate.
                        </p>
                        </div>
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks />
                </div>

                <section id="certificate-options" className="bg-[#f5f7fa]">
                    <div className="onya-section mx-auto max-w-7xl px-5 md:px-8">
                    <p className="onya-kicker">Certificate type</p>
                    <h2 className="onya-heading-xl mt-4 max-w-[11ch] text-[#06142b]">
                        Support matched to the care you need
                    </h2>
                    <p className="mt-5 max-w-2xl text-base leading-relaxed text-text-secondary md:text-lg">
                        Choose the certificate use case that matches your situation.
                    </p>

                    <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                        {USE_CASES.map((useCase) => {
                            const selected = useCase.key === currentUseCase.key;
                            return (
                                <article
                                    key={useCase.key}
                                    className={`onya-tile flex h-full flex-col transition ${
                                        selected
                                            ? 'border-primary bg-[#f3f8ff]'
                                            : 'bg-white hover:border-primary'
                                    }`}
                                >
                                    <div className="aspect-[4/3] overflow-hidden bg-[#eef4fb]">
                                        <img
                                            src={useCase.heroImage}
                                            alt={useCase.heroImageAlt}
                                            className={`h-full w-full object-cover ${useCase.cardImageClass}`}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="flex flex-1 flex-col p-5">
                                        <p className="text-sm font-extrabold uppercase text-primary">{selected ? 'Viewing' : useCase.cardCta}</p>
                                        <h3 className="mt-2 text-2xl font-extrabold leading-none text-[#06142b]">
                                            {useCase.cardTitle}
                                        </h3>
                                        <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
                                            {useCase.cardBody}
                                        </p>
                                        <a href={useCase.path} className={selected ? 'onya-button-secondary mt-5 w-full' : 'onya-button mt-5 w-full'}>
                                            {selected ? 'Current type' : useCase.cardCta}
                                            <ArrowRight size={16} />
                                        </a>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
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
