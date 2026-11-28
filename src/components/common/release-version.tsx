// The release number (package.json "version", see docs/releases.md) so the owner can see what is live.
// Next.js inlines both values at build time; the typeof guard keeps bundles built without Next (browser test
// harnesses) from failing on a missing `process`.
// Next.js only inlines the literal `process.env.NEXT_PUBLIC_*` expression, so keep it spelled out.
const hasProcess = typeof process !== "undefined";
const version = (hasProcess && process.env.NEXT_PUBLIC_RELEASE_VERSION) || "unknown";
const sha = ((hasProcess && process.env.NEXT_PUBLIC_RELEASE_SHA) || "").slice(0, 7);

export function ReleaseVersion({ className = "" }: { className?: string }) {
  return (
    <p data-testid="release-version" title={sha ? `Release ${version} (${sha})` : undefined}
      className={`text-xs group-data-[collapsible=icon]:hidden ${className}`}>
      Release {version}
    </p>
  );
}
