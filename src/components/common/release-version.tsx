// The release number (package.json "version", see docs/releases.md) so the owner can see what is live.
export function ReleaseVersion({ className = "" }: { className?: string }) {
  const version = process.env.NEXT_PUBLIC_RELEASE_VERSION || "unknown";
  const sha = (process.env.NEXT_PUBLIC_RELEASE_SHA || "").slice(0, 7);
  return (
    <p data-testid="release-version" aria-label={`Release ${version}`} title={sha ? `Release ${version} (${sha})` : undefined}
      className={`text-xs group-data-[collapsible=icon]:hidden ${className}`}>
      Release {version}
    </p>
  );
}
