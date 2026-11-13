export default function ConfirmationLoading() {
  return (
    <main className="flex min-h-[50vh] items-center justify-center p-6">
      <div role="status" aria-live="polite" aria-busy="true" className="max-w-md space-y-4 text-center">
        <div aria-hidden="true" className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-current border-t-transparent" />
        <h1 className="text-2xl font-bold">Vi kontrollerer betalingen</h1>
        <p>Vent et øjeblik, mens vi henter din betalingsstatus.</p>
      </div>
    </main>
  );
}
