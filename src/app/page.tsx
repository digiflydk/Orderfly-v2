'use client'

import Link from 'next/link'

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Velkommen til Orderfly Studio</h1>
      <p className="text-muted-foreground mb-8">
        Brug menuen eller gå direkte til SuperAdmin for at komme i gang.
      </p>
      <Link
        href="/superadmin"
        className="rounded-md bg-primary px-4 py-2 text-white hover:bg-primary/90"
      >
        Gå til SuperAdmin
      </Link>
    </main>
  )
}
