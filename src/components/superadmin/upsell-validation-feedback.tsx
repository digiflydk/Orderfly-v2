import type { FormState } from '@/app/superadmin/upsells/actions';

// Render the action result directly: feedback must not depend on toast mounting
// or React Hook Form's handling of array-level errors.
export function UpsellValidationFeedback({ state, field }: { state: FormState | null; field?: string }) {
  if (!state?.error) return null;
  const errors = state.errors || [];
  if (field) {
    const message = errors.find(error => error.path.length === 1 && error.path[0] === field)?.message;
    return message ? <p id={`${field}-error`} className="text-sm font-medium text-destructive">{message}</p> : null;
  }
  return (
    <div role="alert" className="rounded-md border border-destructive bg-destructive/10 p-4 text-destructive">
      <p className="font-semibold">The upsell was not saved.</p>
      {errors.length ? <ul className="mt-2 list-disc pl-5">
        {errors.map((error,index) => <li key={index}>{error.message}</li>)}
      </ul> : <p>{state.message}</p>}
    </div>
  );
}
