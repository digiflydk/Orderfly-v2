// src/components/superadmin/docs/DocsLayout.tsx
import React from 'react';

type Props = {
  sidebar: React.ReactNode;
  children: React.ReactNode;
};

export default function DocsLayout({ sidebar, children }: Props) {
  return (
    <div className="flex flex-col md:flex-row gap-6">
      <aside className="w-full md:w-64 md:flex-shrink-0">
        {sidebar}
      </aside>
      <main className="flex-1">{children}</main>
    </div>
  );
}
