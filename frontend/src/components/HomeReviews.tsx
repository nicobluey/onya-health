import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Star } from 'lucide-react';

const HOME_REVIEWS = [
    {
        title: 'Matched me to the right clinician fast',
        body: 'I explained what I needed and got routed to the right provider in minutes. It felt simple and genuinely personalised.',
        meta: 'Verified patient · QLD'
    },
    {
        title: 'Affordable and easy to use',
        body: 'The whole process was clear, quick, and priced fairly. I got quality support without needing to visit a clinic.',
        meta: 'Verified patient · NSW'
    },
    {
        title: 'Great when time is limited',
        body: 'I booked during a workday break and was guided to the right clinician straight away. No waiting-room delays at all.',
        meta: 'Verified patient · VIC'
    },
    {
        title: 'Felt personalised, not generic',
        body: 'The intake questions were smart and the provider fit was spot on. The recommendations were practical and easy to follow.',
        meta: 'Verified patient · SA'
    },
    {
        title: 'Smooth from start to finish',
        body: 'Everything flowed well, from matching to consult completion. It was one of the easiest healthcare experiences I have had.',
        meta: 'Verified patient · WA'
    },
    {
        title: 'Perfect for busy schedules',
        body: 'Being matched quickly meant I did not spend time searching around. I got quality care without disrupting my day.',
        meta: 'Verified patient · TAS'
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
        setTransitionEnabled(false);
        setSlideIndex(cardsPerView + activeIndex);
        requestAnimationFrame(() => {
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
        <section id="for-physicians" className="relative overflow-hidden border-y border-border py-16">
            <div className="absolute inset-0">
                <img
                    src="/HERO.png"
                    alt=""
                    aria-hidden="true"
                    className="h-full w-full object-cover"
                    style={{ objectPosition: '60% 77%' }}
                />
            </div>
            <div className="relative mx-auto max-w-7xl px-5 md:px-8">
                <div className="mb-8 flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="mb-2 text-xs font-bold uppercase tracking-[0.22em] text-white/85">Patient Reviews</p>
                        <h2 className="text-3xl font-serif font-bold text-white md:text-4xl">People trust Onya Health every day</h2>
                        <p className="mt-3 text-base font-bold text-white md:text-lg">Real feedback from recent consults.</p>
                    </div>
                    <a
                        href="#how-it-works"
                        className="hidden h-11 items-center rounded-xl bg-primary px-6 text-sm font-semibold text-white transition hover:bg-primary-hover md:inline-flex"
                    >
                        Find my match
                        <ArrowRight size={16} className="ml-2" />
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
                                <div className="h-full rounded-2xl border border-sand-200 bg-white p-6 shadow-sm transition-shadow hover:shadow-md">
                                    <h3 className="mb-3 min-h-[2.75rem] text-2xl font-bold leading-tight text-text-primary">{review.title}</h3>
                                    <div className="mb-4 flex items-center gap-1 text-black">
                                        {[1, 2, 3, 4, 5].map((star) => (
                                            <Star key={star} size={16} className="fill-current stroke-none" />
                                        ))}
                                    </div>
                                    <p className="mb-5 min-h-[78px] text-[15px] leading-relaxed text-text-secondary">{review.body}</p>
                                    <div className="border-t border-sand-200 pt-4">
                                        <p className="text-sm font-semibold text-text-primary">{review.meta}</p>
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
                                aria-label={`Go to review ${idx + 1}`}
                                onClick={() => jumpTo(idx)}
                                className={`h-2.5 rounded-full transition-all ${idx === activeIndex ? 'w-7 bg-black' : 'w-2.5 bg-sand-300 hover:bg-sand-400'}`}
                            />
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={goPrev}
                            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white text-text-primary hover:bg-sand-50"
                            aria-label="Previous reviews"
                        >
                            <ChevronLeft size={20} />
                        </button>
                        <button
                            type="button"
                            onClick={goNext}
                            className="flex h-12 w-12 items-center justify-center rounded-xl border border-border bg-white text-text-primary hover:bg-sand-50"
                            aria-label="Next reviews"
                        >
                            <ChevronRight size={20} />
                        </button>
                    </div>
                </div>

                <div className="mt-6 md:hidden">
                    <a
                        href="#how-it-works"
                        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition hover:bg-primary-hover"
                    >
                        Find my match
                        <ArrowRight size={16} className="ml-2" />
                    </a>
                </div>
            </div>
        </section>
    );
}
