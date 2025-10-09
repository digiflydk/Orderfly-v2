
// This page is now obsolete as we have a global locations management page.
// We keep it to prevent 404s from old links but redirect.
import { redirect } from 'next/navigation';

export default function BrandSpecificLocationsPage() {
    redirect('/superadmin/locations');
}
