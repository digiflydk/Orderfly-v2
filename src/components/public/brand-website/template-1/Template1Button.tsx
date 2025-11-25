
'use client';

import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import * as React from "react";
import { cn } from "@/lib/utils";

const template1ButtonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap text-sm ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-[var(--template1-button-primary-bg)] text-[var(--template1-button-primary-text)] hover:opacity-90",
        secondary: "bg-[var(--template1-button-secondary-bg)] text-[var(--template1-button-secondary-text)] hover:opacity-90",
      },
    },
    defaultVariants: {
      variant: "primary",
    },
  }
);

export interface Template1ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof template1ButtonVariants> {
  asChild?: boolean;
}

const Template1Button = React.forwardRef<HTMLButtonElement, Template1ButtonProps>(
  ({ className, variant, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const buttonStyle: React.CSSProperties = {
      ...style,
      borderRadius: 'var(--template1-button-radius)',
      padding: 'var(--template1-button-padding-y) var(--template1-button-padding-x)',
      fontWeight: 'var(--template1-button-font-weight)',
      textTransform: 'var(--template1-button-uppercase)' as 'uppercase' | 'none',
    };

    return (
      <Comp
        className={cn(template1ButtonVariants({ variant, className }))}
        ref={ref}
        style={buttonStyle}
        {...props}
      />
    );
  }
);
Template1Button.displayName = "Template1Button";

export { Template1Button, template1ButtonVariants };
