import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '../../lib/cn';

type Tone = 'green' | 'slate';

const toneClasses: Record<Tone, { chip: string; icon: string; button: string; panel: string }> = {
  green: {
    chip: 'border-[#b9c8ba] bg-[#eff4ef] text-[#1f5f3f]',
    icon: 'bg-white text-[#1f5f3f] ring-[#dbe2d9]',
    button: 'bg-[#1f5f3f] text-white hover:bg-[#174a31] focus-visible:ring-[#1f5f3f]',
    panel: 'border-[#dbe2d9] bg-[#f8faf7]',
  },
  slate: {
    chip: 'border-[#cbd5e1] bg-white text-[#334155]',
    icon: 'bg-[#f8fafc] text-[#475569] ring-[#e2e8f0]',
    button: 'border border-[#cbd5e1] bg-white text-[#334155] hover:bg-[#f8fafc] focus-visible:ring-[#475569]',
    panel: 'border-[#cbd5e1] bg-white',
  },
};

export function PlanCard({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <article
      className={cn(
        'rounded-3xl border border-[#dbe2d9] bg-white shadow-[0_24px_52px_-42px_rgba(15,23,42,0.35)]',
        className
      )}
      {...props}
    >
      {children}
    </article>
  );
}

export function SoftPanel({ className, tone = 'green', children, ...props }: HTMLAttributes<HTMLDivElement> & { tone?: Tone }) {
  return (
    <div className={cn('rounded-2xl border p-3.5', toneClasses[tone].panel, className)} {...props}>
      {children}
    </div>
  );
}

export function IconPill({
  icon: Icon,
  label,
  value,
  active = false,
  tone = 'green',
  className,
  ...props
}: HTMLAttributes<HTMLDivElement> & {
  icon: LucideIcon;
  label?: string;
  value: ReactNode;
  active?: boolean;
  tone?: Tone;
}) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold shadow-[0_10px_22px_-20px_rgba(15,23,42,0.5)]',
        active ? toneClasses[tone].chip : toneClasses.slate.chip,
        className
      )}
      {...props}
    >
      <span className={cn('inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1', toneClasses[tone].icon)}>
        <Icon size={13} aria-hidden="true" />
      </span>
      <span className="min-w-0">
        {label ? <span className="mr-1 text-[#64748b]">{label}</span> : null}
        <span>{value}</span>
      </span>
    </div>
  );
}

export function ChoicePillButton({
  icon: Icon,
  active,
  children,
  className,
  tone = 'green',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon?: LucideIcon;
  active: boolean;
  tone?: Tone;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(
        'inline-flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
        active ? toneClasses[tone].chip : 'border-[#cbd5e1] bg-white text-[#334155] hover:border-[#b9c8ba] hover:bg-[#f8faf7]',
        className
      )}
      {...props}
    >
      {Icon ? (
        <span className={cn('inline-flex h-6 w-6 items-center justify-center rounded-full ring-1', active ? toneClasses[tone].icon : toneClasses.slate.icon)}>
          <Icon size={13} aria-hidden="true" />
        </span>
      ) : null}
      <span>{children}</span>
    </button>
  );
}

export function ActionButton({
  variant = 'primary',
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' }) {
  const variantClass =
    variant === 'primary'
      ? toneClasses.green.button
      : variant === 'secondary'
        ? toneClasses.slate.button
        : 'text-[#334155] hover:bg-[#f8faf7] focus-visible:ring-[#1f5f3f]';

  return (
    <button
      type="button"
      className={cn(
        'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-70',
        variantClass,
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  hint,
  tone = 'green',
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  return (
    <div className={cn('rounded-2xl border bg-white p-3.5', toneClasses[tone].panel, className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#64748b]">{label}</p>
        <span className={cn('inline-flex h-9 w-9 items-center justify-center rounded-xl ring-1', toneClasses[tone].icon)}>
          <Icon size={17} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-[#020617]">{value}</p>
      {hint ? <p className="mt-1 text-xs leading-5 text-[#475569]">{hint}</p> : null}
    </div>
  );
}

export function ProgressBar({ value, className }: { value: number; className?: string }) {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={safeValue}
      className={cn('h-2 overflow-hidden rounded-full bg-[#dbe2d9]', className)}
    >
      <div className="h-full rounded-full bg-[#1f5f3f] transition-[width] duration-300" style={{ width: `${safeValue}%` }} />
    </div>
  );
}
