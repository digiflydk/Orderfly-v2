import * as React from "react";

type Props = React.HTMLAttributes<HTMLSpanElement> & { text?: string };

export default function SiteLogo({ text = "SiteLogo", className, ...rest }: Props) {
  return (
    <span className={className} {...rest}>
      {text}
    </span>
  );
}
