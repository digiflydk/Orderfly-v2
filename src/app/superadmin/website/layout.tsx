export default function WebsiteLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-[calc(100vh-56px)] w-full bg-neutral-950 text-neutral-100">
      <div className="mx-auto max-w-[1140px] px-4 py-6">
        <header className="mb-6">
          <h1 className="text-xl font-semibold">Website (Public /) — CMS</h1>
          <p className="text-sm text-neutral-400">
            Redigér indhold, design og indstillinger for den offentlige forside.
          </p>
        </header>
        {children}
      </div>
    </div>
  );
}
