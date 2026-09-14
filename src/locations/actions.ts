'use server';
import { getAllLocations } from '@/app/superadmin/locations/actions';
export { createOrUpdateLocation, deleteLocation, getActiveLocationBySlug, getLocationBySlug, getAllLocations, getLocationById, getTimeSlots } from '@/app/superadmin/locations/actions';
export type { FormState } from '@/app/superadmin/locations/actions';
export async function getLocationsForBrand(brandId: string) { return getAllLocations(brandId); }
