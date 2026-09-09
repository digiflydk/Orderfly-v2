import type { Brand } from '@/types';

export function brandRecord(id: string, data: Record<string, unknown>): Brand {
  const name = [data.name, data.companyName, data.slug].find(
    value => typeof value === 'string' && value.trim().length > 0,
  );
  // Imported/legacy records may contain an obsolete embedded id or no name.
  return { ...data, id, name: name || `Brand (${id})` } as Brand;
}
