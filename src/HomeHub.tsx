import { useEffect, useState } from 'react';
import { ArrowRight, Check, Menu, Star, X } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { SERVICE_LIST } from './services';
import { Sparkles } from './components/Sparkles';
import { LiveActivityToast } from './components/LiveActivityToast';
import { FAQ } from './components/FAQ';

const ROTATING_PROVIDERS = ['doctor', 'nutritionist', 'psychologist'];
const HOME_THEME = {
    pageBg: '#fff3e8',
    heroBg: '#de8b42',
    heroTopGlow: 'rgba(255, 255, 255, 0.32)',
    heroBottomGlow: 'rgba(241, 186, 130, 0.50)',
};

const TRUST_ITEMS = [
    'Trusted by 120,000+ Australians',
    'Book online in minutes',
    'Care from home',
    'Secure & confidential',
];

const HOME_REVIEWS = [
    {
        title: 'Easy booking flow',
        body: 'I could pick the right provider and book in minutes. Clean process from start to finish.',
        name: 'Sophie K.',
        date: 'February 20, 2026',
    },
    {
        title: 'Great for busy schedules',
        body: 'Everything is online and flexible. I finally found support that fits around work.',
        name: 'Jordan L.',
        date: 'February 22, 2026',
    },
    {
        title: 'Professional and caring',
        body: 'It felt personal, not rushed. The provider listened and gave clear next steps.',
        name: 'Mia T.',
        date: 'February 23, 2026',
    },
];

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
                    <button
                        type="button"
                        onClick={() => setMenuOpen((prev) => !prev)}
                        className="h-10 w-10 rounded-xl border border-border bg-white/90 text-text-primary flex items-center justify-center"
                        aria-label="Toggle navigation"
                        aria-expanded={menuOpen}
                    >
                        {menuOpen ? <X size={18} /> : <Menu size={18} />}
                    </button>
                </div>
                <AnimatePresence initial={false}>
                    {menuOpen && (
                        <motion.nav
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: 'auto', opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden border-t border-white/60 bg-white/85 backdrop-blur-md px-4 md:px-8 pb-4"
                        >
                            <div className="pt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                                <a href="/doctor" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Doctor</a>
                                <a href="/nutritionist" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Nutritionist</a>
                                <a href="/psychologist" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">Psychologist</a>
                                <a href="#for-physicians" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">For Physicians</a>
                                <a href="#how-it-works" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">How it works</a>
                                <a href="#faq" onClick={() => setMenuOpen(false)} className="block rounded-lg bg-white border border-border px-3 py-2 text-sm font-semibold text-text-primary">FAQ</a>
                            </div>
                        </motion.nav>
                    )}
                </AnimatePresence>
            </header>

            <main className="flex-1">
                <section className="pt-8 md:pt-12 pb-10 md:pb-12 relative overflow-hidden" style={{ backgroundColor: HOME_THEME.heroBg }}>
                    <div
                        className="absolute -top-24 -right-20 h-72 w-72 rounded-full blur-3xl opacity-80"
                        style={{ backgroundColor: HOME_THEME.heroTopGlow }}
                    />
                    <div
                        className="absolute -bottom-28 -left-20 h-72 w-72 rounded-full blur-3xl opacity-80"
                        style={{ backgroundColor: HOME_THEME.heroBottomGlow }}
                    />
                    <Sparkles />
                    <div className="max-w-7xl mx-auto px-5 md:px-8 text-center relative z-10">
                        <h1 className="text-4xl md:text-6xl font-serif font-bold leading-[1.1] text-white tracking-tight">
                            Talk to a physician covered by Onya Health
                        </h1>
                        <p className="text-base md:text-xl text-white font-semibold leading-relaxed max-w-3xl mx-auto mt-5">
                            We match you with the right online provider for your needs in minutes.
                        </p>
                        <div className="mt-5 text-white text-2xl md:text-4xl font-serif font-bold h-12 md:h-14">
                            <span className="capitalize">{displayWord}</span>
                            <span className="animate-pulse ml-1">|</span>
                        </div>
                    </div>
                </section>

                <div className="bg-white border-b border-border py-4 overflow-hidden">
                    <div className="max-w-7xl mx-auto px-6 md:px-8">
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5">
                            {TRUST_ITEMS.map((text, i) => (
                                <div key={i} className="flex flex-col items-center text-center gap-1.5">
                                    <div className="w-6 h-6 rounded-full bg-green-50 flex items-center justify-center text-green-600">
                                        <Check size={16} strokeWidth={3} />
                                    </div>
                                    <span className="font-bold text-text-primary text-sm md:text-base leading-tight">{text}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <section id="how-it-works" className="max-w-7xl mx-auto px-5 md:px-8 py-10 md:py-14">
                    <h2 className="text-3xl font-serif font-bold text-center text-text-primary mb-10">
                        Choose Your Provider
                    </h2>
                    <div className="grid gap-6 md:grid-cols-3 items-stretch">
                        {SERVICE_LIST.map((service) => (
                            <a
                                key={service.slug}
                                href={`/${service.slug}`}
                                className="bg-white rounded-3xl border border-border p-5 md:p-6 shadow-sm h-full flex flex-col hover:shadow-md transition-shadow"
                                aria-label={`Open ${service.providerName} landing page`}
                            >
                                <div
                                    className="rounded-2xl aspect-[4/3] border border-white/50 flex items-center justify-center text-text-primary font-semibold text-sm md:text-base px-4 text-center"
                                    style={{ backgroundColor: service.theme.cardTint }}
                                >
                                    {service.placeholderLabel}
                                </div>
                                <h3 className="font-serif text-2xl font-bold text-text-primary mt-5 capitalize">
                                    {service.homeTitle}
                                </h3>
                                <p className="text-text-secondary mt-3 leading-relaxed">
                                    {service.homeBody}
                                </p>
                                <div className="rounded-2xl bg-sand-25 border border-border p-4 mt-5">
                                    <p className="text-sm italic text-text-primary">"{service.homeReview}"</p>
                                    <p className="text-xs text-text-secondary font-semibold mt-2">{service.homeReviewer}</p>
                                </div>
                                <div
                                    className="mt-auto pt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-white font-semibold text-center"
                                    style={{ backgroundColor: service.theme.primary }}
                                >
                                    {service.primaryCta}
                                    <ArrowRight size={16} />
                                </div>
                            </a>
                        ))}
                    </div>
                </section>

                <div className="py-6 border-y border-border" style={{ backgroundColor: '#ffe8d2' }}>
                    <div className="max-w-7xl mx-auto px-8 text-center">
                        <p className="text-[11px] font-bold text-text-secondary uppercase tracking-[0.28em] mb-5">As seen in</p>
                        <div className="flex flex-wrap justify-center items-center gap-8 grayscale opacity-60 mix-blend-multiply">
                            <span className="text-2xl font-serif font-bold italic">The Sydney Morning Herald</span>
                            <span className="text-2xl font-serif font-bold">news<span className="text-text-primary">.com.au</span></span>
                            <span className="text-2xl font-serif font-black tracking-tighter">ABC NEWS</span>
                            <span className="text-2xl font-serif font-bold italic">The Age</span>
                        </div>
                    </div>
                </div>

                <section id="for-physicians" className="py-14 border-b border-border" style={{ backgroundColor: '#ffe8d2' }}>
                    <div className="max-w-7xl mx-auto px-5 md:px-8">
                        <div className="text-center mb-9">
                            <p className="text-xs font-bold uppercase tracking-[0.22em] text-[#a65f20] mb-2">Patient Reviews</p>
                            <h2 className="text-3xl md:text-4xl font-serif font-bold text-text-primary">People trust Onya Health every day</h2>
                            <p className="text-black font-bold mt-3 text-base md:text-lg">Real feedback from recent consults.</p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-3">
                            {HOME_REVIEWS.map((review) => (
                                <article key={review.name} className="bg-white rounded-2xl border border-sand-200 p-6 shadow-sm">
                                    <h3 className="text-2xl font-bold text-text-primary leading-tight mb-3">{review.title}</h3>
                                    <div className="flex items-center gap-1 text-black mb-4">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star key={star} size={16} className="fill-current stroke-none" />
                                        ))}
                                    </div>
                                    <p className="text-text-secondary leading-relaxed mb-6 text-[15px]">{review.body}</p>
                                    <div className="border-t border-sand-200 pt-4">
                                        <p className="font-bold text-text-primary text-sm">{review.name}</p>
                                        <p className="text-xs text-text-secondary mt-1">{review.date}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    </div>
                </section>

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
        </div>
    );
}
