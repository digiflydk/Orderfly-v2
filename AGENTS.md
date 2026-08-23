# Orderfly Work engineering rules

## Repository and release boundaries

- GitHub is the source of truth.
- Product feature branches target `develop` first. `main` is the production release branch.
- Do not deploy or publish production from an implementation agent.
- Do not bypass the `develop` staging verification step for normal product work.

## Firebase project separation

- Firebase App Hosting project: `orderfly-v21-10334086-b3076`.
- Production data project: `orderfly-39325`.
- Do not point public/server Firebase data configuration at the hosting project unless an explicit architecture migration issue requires it.
- Never expose or commit Firebase service-account JSON, API secrets, payment secrets or session credentials.

## Product and security integrity

- Implement the linked GitHub issue and its acceptance criteria, not adjacent speculative work.
- Preserve authentication, tenant/brand boundaries and server-side authorization.
- Flag any query or mutation that could read or modify another customer/brand's records without an explicit ownership boundary.
- Do not weaken input validation, authorization or audit behavior to make a test pass.

## Testing

- Run `npm run typecheck` for TypeScript changes.
- Run the relevant Playwright tests for changed user flows.
- Keep browser tests meaningful. Do not skip, loosen or delete assertions merely to make CI green.
- A changed critical business flow needs both successful behavior and important rejection/edge-case coverage.
- Live/staging tests must use the configured staging environment. Unattended tests must not mutate production data.

## Documentation

- Update the relevant files under `docs/` in the same pull request whenever behavior, architecture, APIs, data flow, deployment, operations or testing changes.
- Keep the documented `develop` -> staging -> `main` production release flow accurate.

## Work agent boundary

The Work implementation agent may edit the checked-out repository, add tests and update documentation. It must not merge its own pull request, deploy production, change GitHub secrets or mutate production data. Independent CI/code review and PO acceptance are separate gates.
