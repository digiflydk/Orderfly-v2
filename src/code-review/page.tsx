
export default function CodeReviewListDisabledPage() {
  return (
    <div className="p-6 space-y-2">
      <h1 className="text-2xl font-bold tracking-tight">
        Code reviews (disabled)
      </h1>
      <p className="text-muted-foreground">
        This internal list is currently disabled and does not show
        code reviews. It is temporarily turned off while we stabilise
        the rest of the system.
      </p>
    </div>
  );
}
