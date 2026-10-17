import { loadPortal, portalBase } from '../data';

type Props = { params: Promise<{ brandSlug: string }> };

export default async function TermsPage({ params }: Props) {
  const { brandSlug } = await params;
  const [{ program }, base] = await Promise.all([loadPortal(brandSlug), portalBase(brandSlug)]);
  return (
    <article aria-labelledby="club-terms-title" className="flex flex-col gap-4">
      <h1 id="club-terms-title" className="text-center text-3xl">Vilkår for {program.name}</h1>
      {program.terms.trim()
        ? <div className="whitespace-pre-line leading-relaxed">{program.terms}</div>
        : <p className="text-center">Vilkårene kan ikke vises lige nu, fordi klubben ikke er åben.</p>}
      <a href={base} className="self-center py-2 underline underline-offset-4">Tilbage til {program.name}</a>
    </article>
  );
}
