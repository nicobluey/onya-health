import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '../lib/cn';
import { COPY } from '../consult-flow/copy';

interface FAQProps {
    maxItems?: number;
}

export function FAQ({ maxItems }: FAQProps) {
    const [openIndex, setOpenIndex] = useState<number | null>(0);
    const [showAll, setShowAll] = useState(false);
    const hasLimit = typeof maxItems === 'number' && maxItems > 0;
    const visibleItems = hasLimit && !showAll ? COPY.faq.items.slice(0, maxItems) : COPY.faq.items;

    return (
        <div className="mx-auto w-full max-w-3xl px-4 py-14">
            <p className="onya-kicker text-center">Questions</p>
            <h2 className="onya-heading mt-3 text-center">{COPY.faq.title}</h2>
            <div className="mt-8 border-y border-border">
                {visibleItems.map((item, idx) => (
                    <div key={idx} className="border-b border-border last:border-b-0">
                        <button
                            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                            className="flex w-full items-center justify-between gap-5 py-5 text-left text-lg font-extrabold text-text-primary focus:outline-none"
                        >
                            <span>{item.q}</span>
                            <ChevronDown
                                className={cn("h-5 w-5 transition-transform text-text-secondary", openIndex === idx ? "rotate-180" : "")}
                            />
                        </button>
                        <AnimatePresence>
                            {openIndex === idx && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: "auto", opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="overflow-hidden"
                                >
                                    <p className="pb-5 text-text-secondary leading-relaxed">
                                        {item.a}
                                    </p>
                                    {'linkHref' in item && item.linkHref && (
                                        <a
                                            href={item.linkHref}
                                            className="inline-flex pb-5 text-sm font-extrabold text-primary hover:text-primary-hover"
                                        >
                                            {'linkLabel' in item && item.linkLabel ? item.linkLabel : 'Learn more'}
                                        </a>
                                    )}
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
            {hasLimit && COPY.faq.items.length > maxItems && (
                <div className="mt-6 flex justify-center">
                    <button
                        type="button"
                        onClick={() => setShowAll((prev) => !prev)}
                        className="onya-button-secondary h-11 px-5 text-sm"
                    >
                        {showAll ? 'Show fewer questions' : `Show all questions (${COPY.faq.items.length})`}
                    </button>
                </div>
            )}
        </div>
    );
}
