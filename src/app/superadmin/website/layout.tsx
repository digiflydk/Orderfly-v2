
export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  // This layout is intentionally minimal.
  // The main Superadmin layout provides the primary chrome (sidebar, header).
  return <>{children}</>;
}
