import React from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '../lib/cn';
import { MagneticButton } from './lightswind/MagneticButton';

// --- BUTTON ---
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
    fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', fullWidth, children, ...props }, ref) => {
        return (
            <MagneticButton
                ref={ref}
                variant={variant}
                size="md"
                strength={0.42}
                radius={96}
                className={cn(
                    fullWidth ? "w-full" : "",
                    className
                )}
                {...props}
            >
                {children}
            </MagneticButton>
        );
    }
);
Button.displayName = "Button";

// --- CARD ---
interface SelectableCardProps {
    selected: boolean;
    onClick: () => void;
    children: React.ReactNode;
    className?: string;
}

export const SelectableCard = ({ selected, onClick, children, className }: SelectableCardProps) => (
    <div
        onClick={onClick}
        className={cn(
            "cursor-pointer rounded-xl border-2 p-4 transition-all duration-200 flex items-center justify-between",
            selected
                ? "border-primary bg-sunlight-50/70 shadow-sm"
                : "border-border bg-white hover:border-sand-300 hover:shadow-sm",
            className
        )}
    >
        <div className="font-medium text-text-primary">{children}</div>
        {selected && <div className="h-6 w-6 rounded-full bg-primary flex items-center justify-center text-sand-50">
            <Check size={14} />
        </div>}
    </div>
);

// --- INPUT ---
interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
    label?: string;
    error?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
    ({ className, label, error, ...props }, ref) => {
        return (
            <div className="w-full space-y-1.5">
                {label && <label className="block text-sm font-medium text-text-secondary">{label}</label>}
                <input
                    ref={ref}
                    className={cn(
                        "flex h-12 w-full rounded-lg border border-border bg-white px-3 py-2 text-sm ring-offset-white file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-bark-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:border-transparent disabled:cursor-not-allowed disabled:opacity-50 transition-all",
                        error ? "border-red-500" : "",
                        className
                    )}
                    {...props}
                />
                {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
        );
    }
);
Input.displayName = "Input";

// --- CHECKBOX ---
interface CheckboxProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

export const Checkbox = ({ checked, onChange, label }: CheckboxProps) => (
    <label className="flex items-start space-x-3 cursor-pointer group">
        <div className="relative flex items-center">
            <input
                type="checkbox"
                className="peer sr-only"
                checked={checked}
                onChange={(e) => onChange(e.target.checked)}
            />
            <div className={cn(
                "h-5 w-5 rounded border transition-all flex items-center justify-center",
                checked ? "bg-primary border-primary" : "border-gray-300 bg-white group-hover:border-sand-300"
            )}>
                {checked && <Check size={14} className="text-sand-50" />}
            </div>
        </div>
        <span className="text-sm text-text-secondary leading-tight select-none pt-0.5">{label}</span>
    </label>
);

// --- MODAL ---
export const Modal = ({ isOpen, onClose, children }: { isOpen: boolean; onClose?: () => void; children: React.ReactNode }) => (
    <AnimatePresence>
        {isOpen && (
            <>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-[80] bg-bark-900/46 backdrop-blur-sm"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, y: 36, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 26, scale: 0.98 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="pointer-events-none fixed inset-0 z-[90] flex items-end justify-center px-0 pb-0 pt-16 md:items-center md:px-4 md:pb-4 md:pt-20"
                >
                    <div className="lw-border-beam pointer-events-auto w-full max-h-[calc(100dvh-4rem)] overflow-y-auto rounded-t-3xl border border-white/75 bg-white shadow-[0_32px_72px_-30px_rgba(15,23,42,0.62)] md:max-h-[calc(100dvh-6rem)] md:max-w-[640px] md:rounded-3xl">
                        {children}
                    </div>
                </motion.div>
            </>
        )}
    </AnimatePresence>
);
