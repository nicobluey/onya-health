import { useMemo, useState } from 'react';

function initialsFromName(name: string) {
  const tokens = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  if (tokens.length === 0) return 'D';
  return tokens.map((token) => token[0]?.toUpperCase() || '').join('');
}

export default function ProfileAvatar({
  name,
  imageUrl,
  alt,
  className,
  fallbackClassName,
}: {
  name: string;
  imageUrl?: string;
  alt: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const initials = useMemo(() => initialsFromName(name), [name]);
  const resolvedImageUrl = String(imageUrl || '').trim();

  if (resolvedImageUrl && !imageFailed) {
    return (
      <img
        src={resolvedImageUrl}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => setImageFailed(true)}
      />
    );
  }

  return (
    <div
      className={fallbackClassName || `${className} flex items-center justify-center bg-[#dbeeff] text-[#2e8cff]`}
      aria-label={alt}
      role="img"
      title={name}
    >
      <span className="text-sm font-semibold">{initials}</span>
    </div>
  );
}
