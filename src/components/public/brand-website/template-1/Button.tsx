
'use client';
import { Slot } from "@radix-ui/react-slot"
import * as React from "react"
import { cn } from "@/lib/utils"

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  asChild?: boolean
}

const Template1Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    
    const buttonStyle: React.CSSProperties = {
        borderRadius: 'var(--template1-button-radius)',
        paddingLeft: 'var(--template1-button-padding-x)',
        paddingRight: 'var(--template1-button-padding-x)',
        paddingTop: 'var(--template1-button-padding-y)',
        paddingBottom: 'var(--template1-button-padding-y)',
        fontWeight: 'var(--template1-button-font-weight)',
        textTransform: 'var(--template1-button-uppercase)' as any,
        backgroundColor: 'var(--template1-button-primary-bg)',
        color: 'var(--template1-button-primary-text)',
    };

    return (
      <Comp
        className={cn("inline-flex items-center justify-center whitespace-nowrap transition-opacity hover:opacity-90 disabled:opacity-50", className)}
        ref={ref}
        style={buttonStyle}
        {...props}
      />
    )
  }
)
Template1Button.displayName = "Template1Button"

export { Template1Button }
