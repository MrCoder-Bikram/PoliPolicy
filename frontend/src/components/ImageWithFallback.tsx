import { useState } from 'react';
import { ShieldCheck } from 'lucide-react';

interface ImageWithFallbackProps {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle?: string;
}

export function ImageWithFallback({
  src,
  alt,
  className = '',
  fallbackTitle = 'PolicyPulse Health Coverage',
}: ImageWithFallbackProps) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#E9F1EE] via-[#F4F7F6] to-[#DDE9E4] text-[#0F2922] p-6 ${className}`}
        role="img"
        aria-label={alt}
      >
        <ShieldCheck className="w-10 h-10 text-[#0D7A5F] mb-2" aria-hidden="true" />
        <p className="text-sm font-medium text-center text-[#13362D]">{fallbackTitle}</p>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
