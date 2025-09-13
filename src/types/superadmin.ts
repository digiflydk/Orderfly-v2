export interface SACommonFilters {
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD
  brandId?: string | 'all';
  locationIds?: string[]; // tom/undefined = alle
}
