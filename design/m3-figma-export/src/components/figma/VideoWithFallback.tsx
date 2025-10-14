import { VideoHTMLAttributes } from 'react';

interface VideoWithFallbackProps extends VideoHTMLAttributes<HTMLVideoElement> {
  src: string;
  fallbackSrc?: string;
  isStreamable?: boolean;
  streamableId?: string;
}

export function VideoWithFallback({ 
  src, 
  fallbackSrc, 
  className = '',
  isStreamable = false,
  streamableId,
  ...props 
}: VideoWithFallbackProps) {
  // If it's a Streamable video, use iframe embed
  if (isStreamable && streamableId) {
    return (
      <div className={`${className} relative`} style={{ width: '100%', height: '100%' }}>
        <iframe 
          allow="fullscreen;autoplay" 
          allowFullScreen 
          src={`https://streamable.com/e/${streamableId}?autoplay=1&nocontrols=1&loop=1&muted=1`}
          style={{
            border: 'none',
            width: '100%',
            height: '100%',
            position: 'absolute',
            left: 0,
            top: 0,
            overflow: 'hidden'
          }}
        />
      </div>
    );
  }

  // Otherwise use standard video element
  return (
    <video
      src={src}
      className={className}
      autoPlay
      loop
      muted
      playsInline
      {...props}
    />
  );
}
