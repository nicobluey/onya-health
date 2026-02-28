import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { LIVE_ACTIVITY_MESSAGES } from '../liveActivity';

interface LiveActivityToastProps {
    mobile?: boolean;
}

function randomDelay() {
    return Math.floor(Math.random() * 5001) + 5000;
}

export function LiveActivityToast({ mobile = false }: LiveActivityToastProps) {
    const [visible, setVisible] = useState(false);
    const [messageIndex, setMessageIndex] = useState(0);

    useEffect(() => {
        let mounted = true;
        let showTimer: ReturnType<typeof setTimeout> | null = null;
        let hideTimer: ReturnType<typeof setTimeout> | null = null;

        const schedule = () => {
            showTimer = setTimeout(() => {
                if (!mounted) return;

                setMessageIndex((prev) => (prev + 1) % LIVE_ACTIVITY_MESSAGES.length);
                setVisible(true);

                hideTimer = setTimeout(() => {
                    if (!mounted) return;
                    setVisible(false);
                }, 3000);

                schedule();
            }, randomDelay());
        };

        schedule();

        return () => {
            mounted = false;
            if (showTimer) clearTimeout(showTimer);
            if (hideTimer) clearTimeout(hideTimer);
        };
    }, []);

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: 24, opacity: 0 }}
                    transition={{ duration: 0.25 }}
                    className={`fixed z-40 rounded-xl bg-white/95 backdrop-blur border border-border shadow-xl ${mobile ? 'left-6 right-6 bottom-4 p-2.5' : 'right-6 bottom-6 max-w-[460px] p-3'}`}
                >
                    <div className="flex items-start gap-3">
                        <div className={`${mobile ? 'mt-0 p-1.5' : 'mt-0.5 p-2'} bg-forest-100 rounded-full text-forest-700`}>
                            <Check size={mobile ? 12 : 14} strokeWidth={3} />
                        </div>
                        <div className="min-w-0">
                            <p className={`${mobile ? 'text-[10px]' : 'text-[11px]'} font-bold uppercase tracking-wider text-text-secondary`}>Live Activity</p>
                            <p className={`${mobile ? 'text-xs mt-0.5' : 'text-sm mt-1'} font-medium text-text-primary leading-snug`}>{LIVE_ACTIVITY_MESSAGES[messageIndex]}</p>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
