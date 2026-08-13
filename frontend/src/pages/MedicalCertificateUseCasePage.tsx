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
    cardImage: string;
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
        title: 'Need a medical certificate today?',
        subtitle: 'Start online in a few minutes. An Australian doctor reviews your symptoms, dates, and context, then sends a certificate digitally if approved.',
        heroImage: '/generated/medcert-hero.webp',
        heroObjectClass: 'object-[58%_center] md:object-center',
        heroImageAlt: 'Patient starting an online medical certificate request from home',
        cardImage: '/generated/medcert-hero.webp',
        cardTitle: 'General request',
        cardBody: 'Not sure which path fits? Start here and choose the reason inside the request.',
        cardCta: 'Start request',
        cardImageClass: 'object-[58%_center]',
        purposeParam: null,
        metaTitle: 'Request a Medical Certificate Online | $9.17 for 1 Day | Onya Health',
        metaDescription: 'Request a medical certificate online from $9.17 for a 1-day request, with pricing shown before payment. Australian doctor review required; issued where clinically appropriate.',
    },
    {
        key: 'student',
        path: '/student',
        aliases: ['/medical-certificate-student', '/medical-certificate-university'],
        title: 'Ill and missing uni?',
        subtitle: 'When sickness hits a class, exam, placement, or deadline, start a student certificate request online and get a doctor-reviewed outcome.',
        heroImage: '/generated/medcert-student-hero.webp',
        heroObjectClass: 'object-[54%_center] md:object-center',
        heroImageAlt: 'Student completing a medical certificate request online',
        cardImage: '/generated/medcert-student.webp',
        cardTitle: 'Student certificate',
        cardBody: 'For missed classes, exams, placements, and assessment deadlines when you are unwell.',
        cardCta: 'Start student request',
        cardImageClass: 'object-center',
        purposeParam: 'university',
        metaTitle: 'Student Medical Certificates | $9.17 for 1 Day | Onya Health',
        metaDescription: 'Request an online student medical certificate for $9.17 for 1 day with Australian doctor review and digital delivery where clinically appropriate.',
    },
    {
        key: 'caretaker',
        path: '/caretaker',
        aliases: ['/ca', '/medical-certificate-caretaker', '/medical-certificate-carers-leave'],
        title: 'Caring for someone sick?',
        subtitle: 'Start a carer or parent leave certificate request online when someone under your care needs you at home.',
        heroImage: '/generated/medcert-carer-hero.webp',
        heroObjectClass: 'object-[44%_center] md:object-center',
        heroImageAlt: 'Carer completing an online medical certificate request while a child rests nearby',
        cardImage: '/generated/medcert-carer.webp',
        cardTitle: 'Carer certificate',
        cardBody: 'For parent and carer leave when a child, family member, or person under your care is unwell.',
        cardCta: 'Start carer request',
        cardImageClass: 'object-center',
        purposeParam: 'carers-leave',
        metaTitle: 'Carer Medical Certificates | $9.17 for 1 Day | Onya Health',
        metaDescription: 'Request an online carer leave certificate for $9.17 for 1 day with secure Australian doctor review and digital delivery where clinically appropriate.',
    },
    {
        key: 'work',
        path: '/work',
        aliases: ['/medical-certificate-work'],
        title: 'Too sick for work?',
        subtitle: 'Request sick-leave evidence online without sitting in a waiting room. A doctor reviews the details and sends a certificate digitally if approved.',
        heroImage: '/generated/medcert-work-hero.webp',
        heroObjectClass: 'object-[52%_center] md:object-center',
        heroImageAlt: 'Worker requesting a medical certificate online',
        cardImage: '/generated/medcert-work.webp',
        cardTitle: 'Work certificate',
        cardBody: 'For short sick-leave absences when your employer asks for medical evidence.',
        cardCta: 'Start work request',
        cardImageClass: 'object-center',
        purposeParam: 'work',
        metaTitle: 'Work Medical Certificates | $9.17 for 1 Day | Onya Health',
        metaDescription: 'Request an online work medical certificate for $9.17 for 1 day with Australian doctor review and digital delivery where clinically appropriate.',
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
                <section className="relative overflow-hidden bg-[#06142b]">
                    <div className="absolute inset-0">
                        <img
                            src={currentUseCase.heroImage}
                            alt={currentUseCase.heroImageAlt}
                            className={`h-full w-full object-cover ${currentUseCase.heroObjectClass}`}
                        />
                    </div>
                    <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(6,20,43,0.94)_0%,rgba(6,20,43,0.78)_52%,rgba(6,20,43,0.6)_100%)] md:bg-[linear-gradient(90deg,rgba(6,20,43,0.95)_0%,rgba(6,20,43,0.78)_38%,rgba(6,20,43,0.28)_70%,rgba(6,20,43,0.04)_100%)]" />

                    <div className="relative z-10 mx-auto flex min-h-[calc(100svh-64px)] max-w-7xl items-center px-5 py-10 md:min-h-[680px] md:px-8 md:py-20">
                        <div className="max-w-[740px]">
                        <p className="onya-kicker border-white/20 bg-white/10 text-white">$9.17 one-day request</p>
                        <h1 className="onya-display mt-5 max-w-[10ch] text-white">
                            {currentUseCase.title}
                        </h1>
                        <p className="mt-5 max-w-[620px] text-lg font-bold leading-relaxed text-white/88 md:text-xl">
                            {currentUseCase.subtitle}
                        </p>
                        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                            <a href={bookingHref} className="onya-button bg-white text-[#06142b] hover:bg-[#edf2ff]">
                                Start from $9.17
                                <ArrowRight size={18} />
                            </a>
                            <a href="#certificate-options" className="onya-button-secondary border-white/20 bg-white/10 text-white hover:bg-white/18">
                                Compare certificate types
                            </a>
                        </div>
                        <p className="mt-4 max-w-[560px] text-sm font-bold text-white/78">
                            You are paying for doctor review. Certificates are issued only where clinically appropriate.
                        </p>
                        </div>
                    </div>
                </section>

                <div id="how-it-works">
                    <HowItWorks serviceSlug="doctor" />
                </div>

                <section id="certificate-options" className="bg-[#f5f7fa]">
                    <div className="onya-section mx-auto max-w-7xl px-5 md:px-8">
                    <p className="onya-kicker">Certificate type</p>
                    <h2 className="onya-heading-xl mt-4 max-w-[12ch] text-[#06142b]">
                        Pick the request that matches the problem.
                    </h2>
                    <p className="mt-5 max-w-2xl text-base font-semibold leading-relaxed text-text-secondary md:text-lg">
                        Different situations need different context. Choose the closest match so the doctor starts with the right information.
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
                                            src={useCase.cardImage}
                                            alt={useCase.heroImageAlt}
                                            className={`h-full w-full object-cover ${useCase.cardImageClass}`}
                                            loading="lazy"
                                        />
                                    </div>
                                    <div className="flex flex-1 flex-col p-5">
                                        <p className="text-sm font-extrabold uppercase text-primary">{selected ? 'Selected' : 'Certificate type'}</p>
                                        <h3 className="mt-2 text-2xl font-extrabold leading-none text-[#06142b]">
                                            {useCase.cardTitle}
                                        </h3>
                                        <p className="mt-3 flex-1 text-sm leading-relaxed text-text-secondary">
                                            {useCase.cardBody}
                                        </p>
                                        <a href={useCase.path} className={selected ? 'onya-button-secondary mt-5 w-full' : 'onya-button mt-5 w-full'}>
                                            {selected ? 'Start this request' : useCase.cardCta}
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
