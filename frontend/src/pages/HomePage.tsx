import { ArrowRight } from 'lucide-react';
import { SERVICE_LIST } from '../consult-flow';
import { FAQ } from '../components/FAQ';
import { BlogsSection, UsedByPatientsSection } from '../components/LandingExtras';
import { Footer } from '../components/Footer';
import { HomeReviews } from '../components/HomeReviews';
import { HowItWorks } from '../components/HowItWorks';
import { HeaderDropdown } from '../components/HeaderDropdown';
import { HeaderBrand } from '../components/HeaderBrand';
import { MagneticButton } from '../components/lightswind/MagneticButton';

const HOME_THEME = {
    pageBg: '#ffffff',
    heroBg: '#ffffff',
};

const HOME_HIGHLIGHTS = [
    { title: 'Fast', detail: 'Online assessment' },
    { title: 'Trusted', detail: 'Practitioner reviewed' },
    { title: 'Personalised', detail: 'Care matched to your needs' },
];

const HOME_CARD_CTA_BY_SLUG: Record<string, string> = {
    doctor: 'Start certificate request',
};

const HOME_CARD_IMAGE_BY_SLUG: Record<string, string> = {
    doctor: '/doctor-consult.webp',
};

export default function HomePage() {
    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: HOME_THEME.pageBg }}>
            <header className="sticky top-0 z-50 w-full border-b border-border bg-white shadow-sm">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <HeaderBrand />
                    <HeaderDropdown />
                </div>
            </header>

            <main className="flex-1">
                <section className="relative overflow-hidden pb-12 pt-24 md:min-h-[640px] md:pb-32 md:pt-28" style={{ backgroundColor: HOME_THEME.heroBg }}>
                    <div className="absolute inset-0">
                        <img
                            src="/HERO.webp"
                            alt=""
                            aria-hidden="true"
                            className="h-full w-full object-cover"
                            style={{ objectPosition: '58% 76%' }}
                        />
                    </div>
                    <div className="max-w-7xl mx-auto px-5 md:px-8 text-center relative z-10">
                        <div className="-mt-4 md:-mt-5">
                            <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                                Medical certificates online
                            </h1>
                            <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                                Request a doctor-reviewed certificate from anywhere in Australia.
                            </p>
                        </div>
                        <div className="mt-5 text-white text-2xl md:text-4xl font-serif font-bold">
                            Doctor-reviewed
                        </div>
                        <div className="mt-7 flex justify-center">
                            <a
                                href="/doctor#book"
                                className="inline-flex h-11 items-center justify-center rounded-xl bg-white px-5 text-sm font-semibold text-bark-900 transition hover:bg-sand-100"
                            >
                                Start certificate request
                                <ArrowRight size={16} className="ml-2" />
                            </a>
                        </div>
                    </div>
                </section>

                <div className="relative overflow-hidden border-b border-border bg-white py-4">
                    <div className="max-w-7xl mx-auto px-6 md:px-8">
                        <div className="relative z-10 grid gap-4 md:grid-cols-[auto_1fr] md:items-center">
                            <div className="grid grid-cols-[repeat(3,minmax(0,1fr))] gap-3 sm:gap-5">
                                {HOME_HIGHLIGHTS.map((item) => (
                                    <div key={item.title} className="min-w-0">
                                        <p className="break-words text-2xl font-bold leading-none text-text-primary">{item.title}</p>
                                        <p className="mt-1 text-xs font-medium text-bark-500">{item.detail}</p>
                                    </div>
                                ))}
                            </div>
                            <p className="max-w-2xl text-sm text-bark-600 md:justify-self-end">
                                Access certificate reviews faster through a clear online intake, secure payment, and digital delivery.
                            </p>
                        </div>
                    </div>
                </div>

                <section id="ai-match-specialties" className="relative scroll-mt-24 overflow-hidden max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="relative z-10 text-3xl font-serif font-bold text-center text-text-primary mb-10">
                        Start with the certificate you need
                    </h2>
                    <p className="relative z-10 mx-auto mb-8 max-w-3xl text-center text-base text-text-secondary">
                        A focused medical-certificate flow keeps the request fast, clinically safe, and easy to complete on any device.
                    </p>
                    <div className="relative z-10 mx-auto grid max-w-xl gap-6 items-stretch">
                        {SERVICE_LIST.map((service) => {
                            return (
                                <article
                                    key={service.slug}
                                    className="relative overflow-hidden bg-white rounded-3xl border border-border p-5 md:p-6 shadow-sm h-full flex flex-col hover:shadow-md transition-shadow"
                                    aria-label={`Open ${service.providerName} landing page`}
                                >
                                    <a href={`/${service.slug}`} className="group block">
                                        <div
                                            className="h-60 overflow-hidden rounded-2xl border border-white/50 flex items-center justify-center text-text-primary font-semibold text-sm md:h-64 md:text-base text-center"
                                            style={{ backgroundColor: service.theme.cardTint }}
                                        >
                                            {HOME_CARD_IMAGE_BY_SLUG[service.slug] ? (
                                                <img
                                                    src={HOME_CARD_IMAGE_BY_SLUG[service.slug]}
                                                    alt={`${service.providerName} preview`}
                                                    className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.015]"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                service.placeholderLabel
                                            )}
                                        </div>
                                    </a>
                                    <h3 className="font-serif text-2xl font-bold text-text-primary mt-5 capitalize">
                                        {service.homeTitle}
                                    </h3>
                                    <p className="text-text-secondary mt-3 leading-relaxed min-h-[7rem]">
                                        {service.homeBody}
                                    </p>
                                    <div className="mt-auto">
                                        <div className="relative pt-6">
                                            <MagneticButton
                                                variant="primary"
                                                size="lg"
                                                strength={0.46}
                                                radius={112}
                                                edgePadding={14}
                                                className="relative z-10 w-full rounded-xl text-center shadow-sm"
                                                style={{ backgroundColor: service.theme.primary }}
                                                onClick={() => {
                                                    window.location.href = `/${service.slug}`;
                                                }}
                                                aria-label={HOME_CARD_CTA_BY_SLUG[service.slug] ?? service.primaryCta}
                                            >
                                                {HOME_CARD_CTA_BY_SLUG[service.slug] ?? service.primaryCta}
                                                <ArrowRight size={16} />
                                            </MagneticButton>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
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
