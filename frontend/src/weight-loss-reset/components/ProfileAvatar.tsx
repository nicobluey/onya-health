import { useEffect, useMemo, useState } from 'react';

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
  const [imageFailed, setImageFailed] = useState(false);
  const [activeImageUrl, setActiveImageUrl] = useState(String(imageUrl || '').trim());
  const initials = useMemo(() => initialsFromName(name), [name]);
  const resolvedImageUrl = String(imageUrl || '').trim();
  const resolvedFallbackImageUrl = String(fallbackImageUrl || '').trim();

  useEffect(() => {
    setActiveImageUrl(resolvedImageUrl);
    setImageFailed(false);
  }, [resolvedImageUrl]);

  if (activeImageUrl && !imageFailed) {
    return (
      <img
        src={activeImageUrl}
        alt={alt}
        className={className}
        loading="lazy"
        decoding="async"
        onError={() => {
          if (activeImageUrl !== resolvedFallbackImageUrl && resolvedFallbackImageUrl) {
            setActiveImageUrl(resolvedFallbackImageUrl);
            return;
          }
          setImageFailed(true);
        }}
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
