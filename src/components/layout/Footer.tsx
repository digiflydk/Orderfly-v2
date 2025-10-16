export default function Footer() {
  return (
    <footer className="mt-12 bg-m3-dark text-white px-6 py-10">
      <div className="max-w-[1200px] mx-auto grid grid-cols-1 gap-8 sm:grid-cols-3">
        <div>
          <img src="/m3/logo.svg" alt="M3 Pizza" className="h-8 mb-3" />
          <p className="text-sm text-neutral-300">
            Den bedste pizzaoplevelse i Danmark – byg din egen eller vælg en af vores signaturmenuer.
          </p>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Åbningstider</h4>
          <p className="text-sm">Man–Søn: 10:00–22:00</p>
        </div>
        <div>
          <h4 className="font-semibold mb-2">Følg os</h4>
          <div className="flex gap-3">
            <a href="#"><img src="/m3/icon-facebook.svg" alt="Facebook" className="h-5" /></a>
            <a href="#"><img src="/m3/icon-instagram.svg" alt="Instagram" className="h-5" /></a>
          </div>
        </div>
      </div>
      <p className="mt-8 text-center text-xs text-neutral-400">© 2025 M3 Pizza. Alle rettigheder forbeholdes.</p>
    </footer>
  );
}
