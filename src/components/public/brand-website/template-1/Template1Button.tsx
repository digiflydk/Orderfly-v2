
'use client';

import { cn } from '@/lib/utils';
import Link from 'next/link';

interface Template1ButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  variant?: 'primary' | 'secondary';
  children: React.ReactNode;
}

export function Template1Button({ href, variant = 'primary', children, className, ...props }: Template1ButtonProps) {
    const baseClasses = "inline-flex items-center justify-center text-center transition-colors duration-300";
    
    const variantClasses = {
        primary: 'bg-[var(--template1-button-primary-bg)] text-[var(--template1-button-primary-text)] hover:opacity-90',
        secondary: 'bg-[var(--template1-button-secondary-bg)] text-[var(--template1-button-secondary-text)] hover:opacity-90',
    };

    const style: React.CSSProperties & { [key: string]: string | number } = {
        borderRadius: 'var(--template1-button-radius)',
        padding: 'var(--template1-button-padding-y) var(--template1-button-padding-x)',
        fontWeight: 'var(--template1-button-font-weight)',
        textTransform: 'var(--template1-button-uppercase)' as 'uppercase' | 'none',
        fontSize: 'var(--template1-font-size-button)',
    };
    
  return (
    <Link
      href={href}
      className={cn(baseClasses, variantClasses[variant], className)}
      style={style}
      {...props}
    >
      {children}
    </Link>
  );
}
