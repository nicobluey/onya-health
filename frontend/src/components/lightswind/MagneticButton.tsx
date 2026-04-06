import React, { forwardRef, useRef, useState } from 'react';
import { motion, useSpring, useTransform } from 'framer-motion';
import { cn } from '../../lib/cn';

export interface MagneticButtonProps
    extends Omit<
        React.ButtonHTMLAttributes<HTMLButtonElement>,
        'children' | 'onDrag' | 'onDragEnd' | 'onDragStart'
    > {
    children: React.ReactNode;
    strength?: number;
    radius?: number;
    edgePadding?: number;
    variant?: 'primary' | 'outline' | 'ghost' | 'dark' | 'secondary';
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

export const MagneticButton = forwardRef<HTMLButtonElement, MagneticButtonProps>(
    (
        {
            children,
            strength = 0.4,
            radius = 90,
            edgePadding = 0,
            variant = 'primary',
            size = 'md',
            className,
            disabled,
            type = 'button',
            ...props
        },
        ref
    ) => {
        const buttonRef = useRef<HTMLDivElement>(null);
        const [isHovered, setIsHovered] = useState(false);

        const springConfig = { stiffness: 200, damping: 18, mass: 0.6 };
        const rawX = useSpring(0, springConfig);
        const rawY = useSpring(0, springConfig);
        const textX = useTransform(rawX, (value) => value * 0.4);
        const textY = useTransform(rawY, (value) => value * 0.4);

        const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
            if (disabled) return;
            const rect = buttonRef.current?.getBoundingClientRect();
            if (!rect) return;

            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const distX = event.clientX - centerX;
            const distY = event.clientY - centerY;
            const dist = Math.sqrt(distX ** 2 + distY ** 2);

            if (dist < radius) {
                rawX.set(distX * strength);
                rawY.set(distY * strength);
                setIsHovered(true);
                return;
            }

            rawX.set(0);
            rawY.set(0);
            setIsHovered(false);
        };

        const handleMouseLeave = () => {
            rawX.set(0);
            rawY.set(0);
            setIsHovered(false);
        };

        const stretchToContainer = typeof className === 'string' && className.includes('w-full');

        const variants = {
            primary: 'bg-primary text-sand-50 hover:bg-primary-hover shadow-lg shadow-primary/20 border border-transparent',
            outline: 'border-2 border-primary text-primary bg-transparent hover:bg-sand-50',
            ghost: 'text-text-secondary bg-transparent hover:bg-sand-75',
            dark: 'bg-text-primary text-sand-50 shadow-lg border border-transparent',
            secondary: 'bg-white border border-primary text-primary hover:bg-sunlight-50 shadow-sm',
        } as const;

        const sizes = {
            sm: 'h-9 px-5 text-sm rounded-xl',
            md: 'h-11 px-6 text-sm rounded-xl',
            lg: 'h-14 px-8 text-base rounded-2xl',
        } as const;

        return (
            <div
                ref={buttonRef}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{
                    display: stretchToContainer ? 'flex' : 'inline-flex',
                    width: stretchToContainer ? '100%' : undefined,
                    padding: edgePadding,
                }}
                data-no-magnetic="true"
            >
                <motion.div
                    style={{ x: rawX, y: rawY }}
                    animate={{ scale: isHovered && !disabled ? 1.03 : 1 }}
                    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                    <button
                        ref={ref}
                        type={type}
                        disabled={disabled}
                        data-lightswind-magnetic="true"
                        className={cn(
                            'relative inline-flex items-center justify-center font-semibold tracking-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 overflow-hidden',
                            variants[variant],
                            sizes[size],
                            className
                        )}
                        {...props}
                    >
                        <motion.span
                            animate={{ opacity: isHovered && !disabled ? 1 : 0 }}
                            transition={{ duration: 0.25 }}
                            className="pointer-events-none absolute inset-0 rounded-[inherit] bg-white/10"
                        />
                        <motion.span style={{ x: textX, y: textY }} className="relative z-10 flex items-center gap-2">
                            {children}
                        </motion.span>
                    </button>
                </motion.div>
            </div>
        );
    }
);

MagneticButton.displayName = 'MagneticButton';
