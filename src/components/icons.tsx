import type { SVGProps } from 'react';

export function OrderFlyLogo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      width="1em"
      height="1em"
      {...props}
    >
      <path fill="none" d="M0 0h256v256H0z" />
      <path
        fill="currentColor"
        d="M128 24a104 104 0 1 0 104 104A104.2 104.2 0 0 0 128 24Zm-8 180.9V164a8 8 0 0 1 16 0v40.9a80.1 80.1 0 0 1-16 0ZM96 128a32 32 0 1 1 32 32a32.1 32.1 0 0 1-32-32Zm40-40.9V51.1a80.1 80.1 0 0 1 16 0V87a8 8 0 0 1-16 0Z"
      />
    </svg>
  );
}
