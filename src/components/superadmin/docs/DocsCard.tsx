// src/components/superadmin/docs/DocsCard.tsx
import React from 'react';

type Props = {
  title: string;
  description: string;
  action: React.ReactNode;
};

export default function DocsCard({ title, description, action }: Props) {
  return (
    <div className="border rounded-lg p-3 bg-card flex flex-col justify-between gap-2">
      <div>
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground mt-1">{description}</p>
      </div>
      <div className="text-xs">{action}</div>
    </div>
  );
}
