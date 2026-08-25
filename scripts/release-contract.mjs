export const REQUIRED_CI_JOBS = Object.freeze(["Typecheck, build and Playwright"]);
export const TRUSTED_ASSOCIATIONS = new Set(["OWNER", "MEMBER", "COLLABORATOR"]);

export function cleanIssueTitle(title) {
  return String(title || "").replace(/^\[[^\]]+\]\s*/, "").trim();
}

export function isTrustedAssociation(value) {
  return TRUSTED_ASSOCIATIONS.has(String(value || "").toUpperCase());
}

export function manualIssueNumber(body) {
  const matches = [...String(body || "").matchAll(/(?:^|\n)Manual-Work-Issue:\s*#(\d+)\s*(?=\n|$)/g)];
  return matches.length === 1 ? Number(matches[0][1]) : null;
}

export function controlledLiveMode(body) {
  const match = String(body || "").match(/(?:^|\n)Controlled-Live-Verification:\s*(none|required)\s*(?=\n|$)/i);
  return match ? match[1].toLowerCase() : null;
}

export function selectCiRun(runs, pr) {
  return [...(runs || [])]
    .filter((run) => run.status === "completed" && run.conclusion === "success")
    .filter((run) => run.head_sha === pr.head.sha)
    .filter((run) => (run.pull_requests || []).some((candidate) => Number(candidate.number) === Number(pr.number)))
    .sort((left, right) => new Date(right.updated_at || right.created_at || 0) - new Date(left.updated_at || left.created_at || 0))[0] || null;
}

export function missingCiJobs(jobs) {
  const successful = new Set((jobs || [])
    .filter((job) => job.status === "completed" && job.conclusion === "success")
    .map((job) => job.name));
  return REQUIRED_CI_JOBS.filter((name) => !successful.has(name));
}

export function selectCleanReview(comments, headSha) {
  const evidence = (comments || [])
    .filter((comment) => isTrustedAssociation(comment.author_association) || comment.user?.login === "github-actions[bot]")
    .filter((comment) => /(?:^|\n)MANUAL_CODE_REVIEW:\s*(?:CLEAN|BLOCKING)\s*(?=\n|$)/.test(comment.body || ""))
    .sort((left, right) => new Date(left.updated_at || left.created_at || 0) - new Date(right.updated_at || right.created_at || 0));
  const latest = evidence.at(-1);
  if (!latest) return null;
  const clean = /(?:^|\n)MANUAL_CODE_REVIEW:\s*CLEAN\s*(?=\n|$)/.test(latest.body || "");
  const reviewedHead = (latest.body || "").match(/(?:^|\n)Reviewed-Head:\s*([0-9a-f]{40})\s*(?=\n|$)/i)?.[1]?.toLowerCase();
  return clean && reviewedHead === String(headSha || "").toLowerCase() ? latest : null;
}

export function validateDeploymentTimestamp(value, { nowMs = Date.now(), mergedAtMs = 0 } = {}) {
  const text = String(value || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/.test(text)) return { valid: false };
  const timestamp = Date.parse(text);
  if (!Number.isFinite(timestamp)) return { valid: false };
  const normalized = new Date(timestamp).toISOString();
  const normalizedWithoutMilliseconds = normalized.replace(".000Z", "Z");
  if (text !== normalized && text !== normalizedWithoutMilliseconds) return { valid: false };
  if (timestamp > nowMs || timestamp < mergedAtMs) return { valid: false };
  return { valid: true, timestamp };
}

export function deploymentEvidenceMatches(body, mergeSha, deploymentRun) {
  const text = String(body || "");
  return /(?:^|\n)DEPLOYMENT_SUCCEEDED\s*(?=\n|$)/.test(text) &&
    text.includes(`Merge-SHA: ${mergeSha}`) &&
    text.includes(`Deployment-Run: ${deploymentRun}`);
}
