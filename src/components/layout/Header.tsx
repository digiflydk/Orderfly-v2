export default function Header() {
  return (
    <header className="flex items-center justify-between bg-white py-4 px-6 shadow-sm">
      <img src="/m3/logo.svg" alt="M3 Pizza" className="h-8" />
      <nav className="hidden md:flex gap-6 text-sm font-semibold">
        <a href="/m3" className="hover:text-m3-purple">Menu</a>
        <a href="/m3/build" className="hover:text-m3-purple">Byg selv</a>
        <a href="/m3/rewards" className="hover:text-m3-purple">Rewards</a>
        <a href="/m3/contact" className="hover:text-m3-purple">Kontakt</a>
      </nav>
    </header>
  );
}
