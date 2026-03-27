type HeaderBrandProps = {
    href?: string;
    compact?: boolean;
};

export function HeaderBrand({ href = '/', compact = false }: HeaderBrandProps) {
    const logoSizeClass = compact ? 'h-10' : 'h-11 md:h-12';

    return (
        <a href={href} className="inline-flex items-center" aria-label="Go to home page">
            <img src="/onya-health-logo.png" alt="Onya Health" className={`${logoSizeClass} w-auto object-contain`} />
        </a>
    );
}
