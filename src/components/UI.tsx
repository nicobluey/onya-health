import React from 'react';
import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { motion, AnimatePresence } from 'framer-motion';
import { Check } from 'lucide-react';

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs));
}

// --- BUTTON ---
interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'primary' | 'outline' | 'ghost' | 'secondary';
    fullWidth?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
    ({ className, variant = 'primary', fullWidth, ...props }, ref) => {
        const variants = {
            primary: "bg-primary hover:bg-primary-hover text-sand-50 border border-transparent shadow-sm",
            outline: "bg-transparent border-2 border-primary text-primary hover:bg-sand-50",
            secondary: "bg-white border border-border text-primary hover:bg-sand-75",
            ghost: "bg-transparent hover:bg-sand-75 text-text-secondary"
        };

        return (
            <button
                ref={ref}
                className={cn(
                    "inline-flex items-center justify-center rounded-xl px-6 py-3 font-semibold transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed",
                    variants[variant],
                    fullWidth ? "w-full" : "",
                    className
                )}
                {...props}
            />
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
                    className="fixed inset-0 bg-bark-900/40 backdrop-blur-sm z-40"
                    onClick={onClose}
                />
                <motion.div
                    initial={{ opacity: 0, y: "100%" }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: "100%" }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="fixed bottom-0 left-0 right-0 w-full md:left-1/2 md:top-1/2 md:bottom-auto md:max-w-md md:-translate-x-1/2 md:-translate-y-1/2 z-50 md:p-4"
                >
                    <div className="bg-white rounded-t-2xl md:rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
                        {children}
                    </div>
                </motion.div>
            </>
        )}
    </AnimatePresence>
);
