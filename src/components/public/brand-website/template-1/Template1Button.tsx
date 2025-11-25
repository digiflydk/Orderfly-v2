'use client';
import { Button as ShadcnButton, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { VariantProps } from "class-variance-authority";
import Link from "next/link";
import * as React from "react";

interface Template1ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  href?: string;
}

const Template1Button = React.forwardRef<HTMLButtonElement, Template1ButtonProps>(
  ({ className, variant, size, asChild = false, href, ...props }, ref) => {
    const customStyles: React.CSSProperties = {
      borderRadius: 'var(--template1-button-radius)',
      padding: `var(--template1-button-padding-y) var(--template1-button-padding-x)`,
      fontWeight: 'var(--template1-button-font-weight)',
      textTransform: 'var(--template1-button-uppercase)' as 'uppercase' | 'none',
    };

    if (variant === 'default') {
        customStyles.backgroundColor = 'var(--template1-button-primary-bg)';
        customStyles.color = 'var(--template1-button-primary-text)';
    } else if (variant === 'secondary') {
        customStyles.backgroundColor = 'var(--template1-button-secondary-bg)';
        customStyles.color = 'var(--template1-button-secondary-text)';
    }

    const Comp = asChild && href ? Link : 'button';

    if (asChild && href) {
      return (
        <Link href={href} passHref>
          <ShadcnButton
            className={cn(className)}
            style={customStyles}
            ref={ref}
            {...props}
          />
        </Link>
      );
    }
    
    return (
      <ShadcnButton
        className={cn(className)}
        style={customStyles}
        ref={ref}
        {...props}
      />
    );
  }
);
Template1Button.displayName = 'Template1Button';

export { Template1Button };
