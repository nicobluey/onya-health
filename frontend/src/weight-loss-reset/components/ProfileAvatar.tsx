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
  fallbackImageUrl,
  alt,
  className,
  fallbackClassName,
}: {
  name: string;
  imageUrl?: string;
  fallbackImageUrl?: string;
  alt: string;
  className: string;
  fallbackClassName?: string;
}) {
  const [failedImageMap, setFailedImageMap] = useState<Record<string, true>>({});
  const initials = useMemo(() => initialsFromName(name), [name]);
  const resolvedImageUrl = String(imageUrl || '').trim();
  const resolvedFallbackImageUrl = String(fallbackImageUrl || '').trim();
  const imageCandidates = useMemo(
    () => Array.from(new Set([resolvedImageUrl, resolvedFallbackImageUrl].filter(Boolean))),
    [resolvedFallbackImageUrl, resolvedImageUrl]
  );
  const activeImageUrl = imageCandidates.find((candidate) => !failedImageMap[candidate]) || '';

  if (activeImageUrl) {
    return (
      <img
        src={activeImageUrl}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => {
          setFailedImageMap((current) =>
            current[activeImageUrl] ? current : { ...current, [activeImageUrl]: true }
          );
        }}
      />
    );
  }

  return (
    <div
      className={fallbackClassName || `${className} flex items-center justify-center bg-[#eff4ef] text-[#1f5f3f]`}
      aria-label={alt}
      role="img"
      title={name}
    >
      <span className="text-sm font-semibold">{initials}</span>
    </div>
  );
}
