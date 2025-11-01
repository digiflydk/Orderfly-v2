// This file is now obsolete and can be removed.
// The logic has been consolidated into the primary `header.tsx` component.
// Keeping it temporarily to avoid breaking imports during transition.

import * as React from "react";

type Props = { text: string };

export default function Header({ text }: Props) {
  return (
    <header className="p-4 border-b">
      <h1 className="text-lg font-semibold">{text}</h1>
    </header>
  );
}
