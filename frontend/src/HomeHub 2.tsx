import { useEffect, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { SERVICE_LIST } from './services';

const ROTATING_PROVIDERS = ['doctor', 'psychologist', 'nutritionist'];
const HOME_THEME = {
    pageBg: '#fff3e8',
    heroBg: '#de8b42',
    heroTopGlow: 'rgba(255, 255, 255, 0.32)',
    heroBottomGlow: 'rgba(241, 186, 130, 0.50)',
};

export default function HomeHub() {
    const [providerIndex, setProviderIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setProviderIndex((prev) => (prev + 1) % ROTATING_PROVIDERS.length);
        }, 2200);

        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen flex flex-col font-sans" style={{ backgroundColor: HOME_THEME.pageBg }}>
            <header className="w-full bg-white/40 backdrop-blur-lg border-b border-white/60 shadow-sm sticky top-0 z-50">
                <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex justify-between items-center">
                    <a
                        href="/"
                        className="font-serif font-bold text-2xl md:text-3xl tracking-tight text-text-primary flex items-center gap-2 md:gap-3"
                        aria-label="Go to home page"
                    >
                        <img src="/logo.png" alt="Onya Health" className="h-11 md:h-14 w-auto object-contain scale-110 origin-left" />
                        <span className="sr-only">Onya Health</span>
                    </a>
                    <div className="hidden md:flex items-center gap-5">
                        {SERVICE_LIST.map((service) => (
                            <a
                                key={service.slug}
                                href={`/${service.slug}`}
                                className="text-text-primary hover:text-forest-700 transition-colors font-medium capitalize"
                            >
                                {service.providerName}
                            </a>
                        ))}
                    </div>
                </div>
            </header>

            <main className="flex-1">
                <section className="pt-10 md:pt-16 pb-14 md:pb-20 relative overflow-hidden" style={{ backgroundColor: HOME_THEME.heroBg }}>
                    <div
                        className="absolute -top-24 -right-20 h-72 w-72 rounded-full blur-3xl opacity-80"
                        style={{ backgroundColor: HOME_THEME.heroTopGlow }}
                    />
                    <div
                        className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full blur-3xl opacity-80"
                        style={{ backgroundColor: HOME_THEME.heroBottomGlow }}
                    />
                    <div className="max-w-7xl mx-auto px-5 md:px-8 text-center relative z-10">
                        <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                            Talk to a <span className="italic">{ROTATING_PROVIDERS[providerIndex]}</span> covered by Onya Health
                        </h1>
                        <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5 md:mt-7">
                            Onya Health is building a single place for online medical support. Choose your provider type and get care from the comfort of home.
                        </p>
                    </div>
                </section>

                <section className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <div className="grid gap-5 md:grid-cols-3">
                        {SERVICE_LIST.map((service) => (
                            <a
                                key={service.slug}
                                href={`/${service.slug}`}
                                className="bg-white rounded-3xl border border-border p-6 md:p-7 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all"
                            >
                                <div
                                    className="inline-flex items-center text-white text-xs font-bold uppercase tracking-wider rounded-full px-3 py-1"
                                    style={{ backgroundColor: service.theme.heroBg }}
                                >
                                    {service.providerName}
                                </div>
                                <h2 className="font-serif text-2xl font-bold text-text-primary mt-4 capitalize">
                                    Talk to a {service.providerName}
                                </h2>
                                <p className="text-text-secondary mt-3 leading-relaxed">
                                    {service.heroSubtitle}
                                </p>
                                <div
                                    className="mt-6 inline-flex items-center gap-2 font-semibold"
                                    style={{ color: service.theme.heroBg }}
                                >
                                    Go to /{service.slug}
                                    <ArrowRight size={16} />
                                </div>
                            </a>
                        ))}
                    </div>
                </section>
            </main>
        </div>
    );
}
