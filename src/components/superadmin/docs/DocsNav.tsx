// src/components/superadmin/docs/DocsNav.tsx
import Link from 'next/link';
import type { DevDocMeta, DevUtilityMeta } from '@/lib/superadmin/docs-config';

type Props = {
  docs: DevDocMeta[];
  utilities: DevUtilityMeta[];
  activeDocId: string;
};

export default function DocsNav({ docs, utilities, activeDocId }: Props) {
  const groupedDocs = {
    overview: docs.filter((d) => d.category === 'overview'),
    api: docs.filter((d) => d.category === 'api'),
    database: docs.filter((d) => d.category === 'database'),
    logging: docs.filter((d) => d.category === 'logging'),
  };

  const navLinkClasses = (active: boolean) =>
    [
      'block text-sm rounded px-2 py-1',
      active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted',
    ].join(' ');

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">
          Developer docs
        </h3>
        <div className="space-y-1">
          {Object.entries(groupedDocs).map(([group, items]) =>
            items.length ? (
              <div key={group} className="mb-2">
                <p className="text-[11px] uppercase text-muted-foreground mb-1">
                  {group}
                </p>
                <div className="space-y-1">
                  {items.map((doc) => (
                    <Link
                      key={doc.id}
                      href={`/superadmin/docs?doc=${doc.id}`}
                      className={navLinkClasses(doc.id === activeDocId)}
                    >
                      {doc.title}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null
          )}
        </div>
      </div>

      <div>
        <h3 className="text-xs font-semibold text-muted-foreground mb-2">
          Utilities
        </h3>
        <div className="space-y-1">
          {utilities.map((util) => (
            <Link
              key={util.id}
              href={util.apiPath}
              className="block text-sm text-muted-foreground hover:underline"
              target={util.type.includes('download') ? '_blank' : undefined}
              rel={util.type.includes('download') ? 'noreferrer' : undefined}
            >
              {util.title}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
