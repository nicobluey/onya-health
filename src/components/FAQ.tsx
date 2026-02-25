import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from './UI';
import { COPY } from '../copy';

export function FAQ() {
    const [openIndex, setOpenIndex] = useState<number | null>(0);

    return (
        <div className="w-full max-w-2xl mx-auto py-12 px-4">
            <h2 className="text-2xl font-bold text-text-primary mb-8 text-center">{COPY.faq.title}</h2>
            <div className="space-y-4">
                {COPY.faq.items.map((item, idx) => (
                    <div key={idx} className="border-b border-border pb-4">
                        <button
                            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
                            className="flex w-full items-center justify-between py-2 text-left text-lg font-medium text-text-primary focus:outline-none"
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
                                    <p className="pt-2 pb-4 text-text-secondary leading-relaxed">
                                        {item.a}
                                    </p>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                ))}
            </div>
        </div>
    );
}
