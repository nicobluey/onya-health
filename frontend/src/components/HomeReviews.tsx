import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight } from 'lucide-react';

const HOME_REVIEWS = [
    {
        title: 'Built for sick days, not admin days',
        body: 'The request asks for the symptoms, dates, and leave context a doctor needs, without making you explain everything twice.',
        meta: 'Why patients use it · Less admin'
    },
    {
        title: 'Clear price before you commit',
        body: 'A 1-day request starts at $11.21, with longer durations shown before payment so there are no checkout surprises.',
        meta: 'Why patients use it · Transparent cost'
    },
    {
        title: 'Doctor review, not a download button',
        body: 'An Australian doctor reviews whether the request is clinically suitable and may ask for more information.',
        meta: 'Why patients use it · Credible evidence'
    },
    {
        title: 'Designed for work and uni pressure',
        body: 'The flow separates work, student, and carer requests so the right evidence context is captured from the start.',
        meta: 'Why patients use it · Better context'
    },
    {
        title: 'Digital delivery if approved',
        body: 'When a certificate is issued, it is sent online so you can forward it where it needs to go.',
        meta: 'Why patients use it · Simple delivery'
    },
    {
        title: 'Clear answer either way',
        body: 'If a certificate is not clinically appropriate, you get guidance on next steps instead of vague rejection copy.',
        meta: 'Why patients use it · No guessing'
    },
];

const getCardsPerView = (width: number) => {
    if (width >= 1400) return 4;
    if (width >= 1024) return 3;
    if (width >= 768) return 2;
    return 1;
};

export function HomeReviews() {
    const totalReviews = HOME_REVIEWS.length;
    const [cardsPerView, setCardsPerView] = useState(() => getCardsPerView(window.innerWidth));
    const [activeIndex, setActiveIndex] = useState(0);
    const [slideIndex, setSlideIndex] = useState(() => getCardsPerView(window.innerWidth));
    const [isPaused, setIsPaused] = useState(false);
    const [transitionEnabled, setTransitionEnabled] = useState(true);
    const prevCardsPerView = useRef(cardsPerView);

    const trackReviews = useMemo(
        () => [...HOME_REVIEWS.slice(-cardsPerView), ...HOME_REVIEWS, ...HOME_REVIEWS.slice(0, cardsPerView)],
        [cardsPerView]
    );

    const goNext = useCallback(() => {
        setTransitionEnabled(true);
        setSlideIndex((prev) => prev + 1);
        setActiveIndex((prev) => (prev + 1) % totalReviews);
    }, [totalReviews]);

    const goPrev = useCallback(() => {
        setTransitionEnabled(true);
        setSlideIndex((prev) => prev - 1);
        setActiveIndex((prev) => (prev - 1 + totalReviews) % totalReviews);
    }, [totalReviews]);

    const jumpTo = (index: number) => {
        const normalized = ((index % totalReviews) + totalReviews) % totalReviews;
        setTransitionEnabled(true);
        setSlideIndex(cardsPerView + normalized);
        setActiveIndex(normalized);
    };

    useEffect(() => {
        const onResize = () => {
            setCardsPerView(getCardsPerView(window.innerWidth));
        };

        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    useEffect(() => {
        if (prevCardsPerView.current === cardsPerView) return;

        prevCardsPerView.current = cardsPerView;
        requestAnimationFrame(() => {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView + activeIndex);
            requestAnimationFrame(() => setTransitionEnabled(true));
        });
    }, [cardsPerView, activeIndex]);

    useEffect(() => {
        if (isPaused) return;

        const interval = setInterval(goNext, 5200);
        return () => clearInterval(interval);
    }, [goNext, isPaused]);

    const handleTrackTransitionEnd = () => {
        if (slideIndex >= cardsPerView + totalReviews) {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setTransitionEnabled(true));
            });
        }

        if (slideIndex < cardsPerView) {
            setTransitionEnabled(false);
            setSlideIndex(cardsPerView + totalReviews - 1);
            requestAnimationFrame(() => {
                requestAnimationFrame(() => setTransitionEnabled(true));
            });
        }
    };

    return (
        <section id="for-physicians" className="relative overflow-hidden border-y border-border bg-[#06142b] py-16">
            <div className="relative mx-auto max-w-7xl px-5 md:px-8">
                <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="onya-kicker mb-4 border-white/20 bg-white/10 text-white">Why patients use Onya</p>
                        <h2 className="onya-heading-xl max-w-[12ch] text-white">Less waiting. Less explaining. Clear evidence.</h2>
                        <p className="mt-4 max-w-2xl text-base font-bold text-white/85 md:text-lg">A focused medical-certificate request for the days when a clinic visit is the last thing you need.</p>
                    </div>
                    <a
                        href="#how-it-works"
                        className="onya-button hidden md:inline-flex"
                    >
                        Start my request
                        <ArrowRight size={16} />
                    </a>
                </div>

                <div
                    className="overflow-hidden"
                    onMouseEnter={() => setIsPaused(true)}
                    onMouseLeave={() => setIsPaused(false)}
                >
                    <div
                        className="-mx-2 flex"
                        style={{
                            transform: `translateX(-${(slideIndex * 100) / cardsPerView}%)`,
                            transition: transitionEnabled ? 'transform 480ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
                        }}
                        onTransitionEnd={handleTrackTransitionEnd}
                    >
                        {trackReviews.map((review, idx) => (
                            <article
                                key={`${review.title}-${review.meta}-${idx}`}
                                className="px-2"
                                style={{ flex: `0 0 ${100 / cardsPerView}%` }}
                            >
                                <div className="h-full border border-white/15 bg-white p-6">
                                    <h3 className="mb-3 min-h-[2.75rem] text-2xl font-extrabold leading-none text-[#06142b]">{review.title}</h3>
                                    <p className="mb-5 min-h-[96px] text-[15px] leading-relaxed text-text-secondary">{review.body}</p>
                                    <div className="border-t border-sand-200 pt-4">
                                        <p className="text-sm font-extrabold text-primary">{review.meta}</p>
                                    </div>
                                </div>
                            </article>
                        ))}
                    </div>
                </div>

                <div className="mt-8 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2">
                        {Array.from({ length: totalReviews }).map((_, idx) => (
                            <button
                                key={idx}
                                type="button"
                                aria-label={`Go to highlight ${idx + 1}`}
                                onClick={() => jumpTo(idx)}
                                className={`h-2.5 rounded-full transition-all ${idx === activeIndex ? 'w-7 bg-primary' : 'w-2.5 bg-sand-300 hover:bg-sand-400'}`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={goPrev}
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white text-text-primary hover:bg-sand-50"
                            aria-label="Previous highlights"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            className="flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-white text-text-primary hover:bg-sand-50"
                            aria-label="Next highlights"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="mt-6 md:hidden">
                    <a
                        href="#how-it-works"
                        className="onya-button w-full"
                    >
                        Start my request
                        <ArrowRight size={16} />
                    </a>
                </div>
            </div>
        </section>
    );
}
