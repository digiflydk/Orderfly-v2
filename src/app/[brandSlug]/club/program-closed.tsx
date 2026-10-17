export function ProgramClosed({ name }: { name: string }) {
  return (
    <section aria-labelledby="club-closed" className="flex flex-col gap-3 text-center">
      <h1 id="club-closed" className="text-3xl">{name}</h1>
      <p>{name} er ikke åben lige nu. Kig forbi igen senere.</p>
    </section>
  );
}
