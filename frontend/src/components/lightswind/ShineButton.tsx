import React from 'react';
import { cn } from '../../lib/cn';

interface ShineButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
    children: React.ReactNode;
    trailColor?: string;
    blurColor?: string;
    className?: string;
}

export function ShineButton({
    children,
    trailColor = '#2e8cff',
    blurColor = '#8484ff',
    className,
    ...props
}: ShineButtonProps) {
    return (
        <button
            {...props}
            className={cn(
                'lw-shine-button inline-flex min-h-[46px] items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold leading-tight text-white outline-offset-4 transition-transform active:translate-y-px',
                className
            )}
            style={
                {
                    '--lw-shine-base': trailColor,
                    '--lw-shine-glow': blurColor,
                } as React.CSSProperties
            }
        >
            <span className="lw-shine-button-label">{children}</span>
        </button>
    );
}
