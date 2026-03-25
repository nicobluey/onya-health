import { useEffect, useRef, useState } from 'react';
import { Grid2x2, X } from 'lucide-react';

type HeaderMenuLink = {
    label: string;
    href: string;
};

type HeaderDropdownProps = {
    links?: HeaderMenuLink[];
    buttonClassName?: string;
    topOffsetClassName?: string;
    panelMode?: 'sheet' | 'floating';
    panelClassName?: string;
};

const DEFAULT_HEADER_LINKS: HeaderMenuLink[] = [
    { label: 'Patient Login', href: '/patient-login' },
    { label: 'Doctor', href: '/doctor' },
    { label: 'Nutritionist', href: '/nutritionist' },
    { label: 'Psychologist', href: '/psychologist' },
    { label: 'For Physicians', href: '/#for-physicians' },
    { label: 'How it works', href: '/#how-it-works' },
    { label: 'FAQ', href: '/#faq' },
];

export function HeaderDropdown({
    links = DEFAULT_HEADER_LINKS,
    buttonClassName = 'h-10 w-10 rounded-xl text-text-primary/90 flex items-center justify-center hover:bg-sand-75 transition-colors',
    topOffsetClassName = 'top-16',
    panelMode = 'sheet',
    panelClassName = 'absolute right-0 top-[calc(100%+10px)] z-50 w-72 rounded-2xl border border-border bg-white/95 p-2 shadow-xl backdrop-blur',
}: HeaderDropdownProps) {
    const [menuOpen, setMenuOpen] = useState(false);
    const wrapperRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        if (!menuOpen) return;

        const handleOutsideClick = (event: MouseEvent) => {
            const target = event.target as Node | null;
            if (target && wrapperRef.current && !wrapperRef.current.contains(target)) {
                setMenuOpen(false);
            }
        };

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === 'Escape') {
                setMenuOpen(false);
            }
        };

        window.addEventListener('mousedown', handleOutsideClick);
        window.addEventListener('keydown', handleEscape);
        return () => {
            window.removeEventListener('mousedown', handleOutsideClick);
            window.removeEventListener('keydown', handleEscape);
        };
    }, [menuOpen]);

    return (
        <div className="relative" ref={wrapperRef}>
            <button
                type="button"
                onClick={() => setMenuOpen((previous) => !previous)}
                className={buttonClassName}
                aria-label="Toggle navigation"
                aria-expanded={menuOpen}
            >
                {menuOpen ? <X size={18} /> : <Grid2x2 size={18} />}
            </button>

            {menuOpen && (
                panelMode === 'sheet' ? (
                    <nav
                        className={`fixed inset-x-0 ${topOffsetClassName} z-50 border-t border-border bg-white px-4 pb-4 md:px-8`}
                    >
                        <div className="mx-auto grid max-w-7xl gap-2 pt-3 sm:grid-cols-2 lg:grid-cols-4">
                            {links.map((link) => (
                                <a
                                    key={`${link.label}-${link.href}`}
                                    href={link.href}
                                    onClick={() => setMenuOpen(false)}
                                    className="block rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-sand-50"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </nav>
                ) : (
                    <nav className={panelClassName}>
                        <div className="grid gap-2">
                            {links.map((link) => (
                                <a
                                    key={`${link.label}-${link.href}`}
                                    href={link.href}
                                    onClick={() => setMenuOpen(false)}
                                    className="block rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-text-primary transition-colors hover:bg-sand-50"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>
                    </nav>
                )
            )}
        </div>
    );
}
