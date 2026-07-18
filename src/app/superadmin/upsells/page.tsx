import { getUpsells } from './actions';
import { getBrands } from '@/app/superadmin/brands/actions';
import { UpsellsClientPage } from './client-page';
import { isAdminReady } from '@/lib/runtime';
import EmptyState from '@/components/ui/empty-state';

type FirestoreTimestampLike = {
  toDate?: () => Date;
  seconds?: number;
  nanoseconds?: number;
  _seconds?: number;
  _nanoseconds?: number;
};

function isPlainObject(
  value: unknown,
): value is Record<string, unknown> {
  if (
    value === null ||
    typeof value !== 'object'
  ) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);

  return (
    prototype === Object.prototype ||
    prototype === null
  );
}

function serializeValue(
  value: unknown,
): unknown {
  if (
    value === null ||
    value === undefined
  ) {
    return value;
  }

  if (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (value instanceof Date) {
    return Number.isNaN(value.getTime())
      ? null
      : value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(item =>
      serializeValue(item),
    );
  }

  if (typeof value === 'object') {
    const timestamp =
      value as FirestoreTimestampLike;

    if (
      typeof timestamp.toDate ===
      'function'
    ) {
      const date = timestamp.toDate();

      return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
    }

    const seconds =
      typeof timestamp.seconds ===
      'number'
        ? timestamp.seconds
        : typeof timestamp._seconds ===
            'number'
          ? timestamp._seconds
          : undefined;

    const nanoseconds =
      typeof timestamp.nanoseconds ===
      'number'
        ? timestamp.nanoseconds
        : typeof timestamp._nanoseconds ===
            'number'
          ? timestamp._nanoseconds
          : 0;

    if (seconds !== undefined) {
      const milliseconds =
        seconds * 1000 +
        Math.floor(nanoseconds / 1_000_000);

      const date = new Date(milliseconds);

      return Number.isNaN(date.getTime())
        ? null
        : date.toISOString();
    }

    if (isPlainObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(
          ([key, nestedValue]) => [
            key,
            serializeValue(nestedValue),
          ],
        ),
      );
    }

    /*
     * Ukendte class-instanser må ikke sendes fra en
     * Server Component til en Client Component.
     * Vi forsøger derfor at konvertere deres egne
     * properties til et almindeligt objekt.
     */
    const objectEntries = Object.entries(
      value as Record<string, unknown>,
    );

    if (objectEntries.length > 0) {
      return Object.fromEntries(
        objectEntries.map(
          ([key, nestedValue]) => [
            key,
            serializeValue(nestedValue),
          ],
        ),
      );
    }

    return null;
  }

  return String(value);
}

async function UpsellsPageContent() {
  const [rawUpsells, rawBrands] =
    await Promise.all([
      getUpsells(),
      getBrands(),
    ]);

  const serializedBrands = serializeValue(
    rawBrands,
  ) as typeof rawBrands;

  const serializedUpsells = serializeValue(
    rawUpsells,
  ) as typeof rawUpsells;

  const brandMap = new Map(
    serializedBrands.map(brand => [
      brand.id,
      brand.name,
    ]),
  );

  const upsellsWithDetails =
    serializedUpsells.map(upsell => ({
      ...upsell,
      brandName:
        brandMap.get(upsell.brandId) ??
        'Unknown Brand',
    }));

  return (
    <UpsellsClientPage
      initialUpsells={upsellsWithDetails}
      brands={serializedBrands}
    />
  );
}

export default function UpsellsPage() {
  if (!isAdminReady()) {
    return (
      <EmptyState
        title="Admin Environment Not Configured"
        hint="This page requires Firebase Admin credentials, which are not available in this environment."
        details="Set FIREBASE_SERVICE_ACCOUNT_JSON to enable this page."
      />
    );
  }

  return <UpsellsPageContent />;
}