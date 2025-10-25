
"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "defaultValue"
> & {
  value?: string | number | readonly string[] | null;
  defaultValue?: string | number | readonly string[] | null;
};

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, value, defaultValue, ...props }, ref) => {
    // To prevent "uncontrolled to controlled" error, we ensure the value is never null/undefined.
    const normalizedValue = value ?? '';
    const normalizedDefaultValue = defaultValue ?? '';

    const isControlled = value !== undefined;
    
    return (
      <input
        ref={ref}
        type={type}
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        {...(isControlled
          ? { value: normalizedValue }
          : { defaultValue: normalizedDefaultValue })}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
