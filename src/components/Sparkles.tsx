const SPARKLES = [
    { top: '8%', left: '8%', size: 28, delay: '0s', drift: '14s', twinkle: '7s', opacity: 0.92 },
    { top: '16%', left: '70%', size: 24, delay: '1.4s', drift: '16s', twinkle: '7.5s', opacity: 0.9 },
    { top: '28%', left: '88%', size: 22, delay: '2.2s', drift: '12s', twinkle: '6.5s', opacity: 0.88 },
    { top: '36%', left: '18%', size: 26, delay: '0.8s', drift: '17s', twinkle: '8s', opacity: 0.92 },
    { top: '48%', left: '62%', size: 30, delay: '1.8s', drift: '18s', twinkle: '8.5s', opacity: 0.95 },
    { top: '58%', left: '30%', size: 24, delay: '0.5s', drift: '15s', twinkle: '7s', opacity: 0.9 },
    { top: '70%', left: '80%', size: 26, delay: '2.4s', drift: '16s', twinkle: '8s', opacity: 0.92 },
    { top: '82%', left: '12%', size: 28, delay: '1.1s', drift: '18s', twinkle: '9s', opacity: 0.94 },
    { top: '88%', left: '50%', size: 22, delay: '0.2s', drift: '14s', twinkle: '7s', opacity: 0.88 },
];

const SPARKLE_SHAPES = [
    'M12 2l1.7 5.4L19 9l-5.3 1.6L12 16l-1.7-5.4L5 9l5.3-1.6L12 2z',
    'M12 3l1.2 4.1 4.1 1.2-4.1 1.2L12 13.6l-1.2-4.1L6.7 8.3l4.1-1.2L12 3z',
];

export function Sparkles() {
    return (
        <div className="sparkle-field" aria-hidden="true">
            {SPARKLES.map((sparkle, index) => (
                <div
                    key={`${sparkle.top}-${sparkle.left}-${index}`}
                    className="sparkle"
                    style={{
                        top: sparkle.top,
                        left: sparkle.left,
                        width: sparkle.size,
                        height: sparkle.size,
                        opacity: sparkle.opacity,
                        animationDuration: sparkle.drift,
                        animationDelay: sparkle.delay,
                    }}
                >
                    <svg
                        className="sparkle-core"
                        viewBox="0 0 24 24"
                        style={{
                            animationDuration: sparkle.twinkle,
                            animationDelay: sparkle.delay,
                        }}
                        aria-hidden="true"
                    >
                        <path
                            d={SPARKLE_SHAPES[index % SPARKLE_SHAPES.length]}
                            fill="currentColor"
                            stroke="currentColor"
                            strokeWidth="0.6"
                        />
                    </svg>
                </div>
            ))}
        </div>
    );
}
