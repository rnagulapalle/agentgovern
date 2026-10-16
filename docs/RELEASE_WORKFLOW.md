# Prototype release workflow

Raj authorized this policy on October 15, 2026 to remove repeated full-suite runs before clients/users onboard. Revisit this policy when that changes; do not silently expand or reduce it.

1. Develop on an internal `codex/**` branch and run focused relevant tests locally.
2. Push. The pre-push hook checks diff hygiene only. GitHub runs the full quality workflow once for that source revision, retaining all tests and coverage requirements.
3. Merge after CI succeeds. A squash merge does not start another full workflow. The release script verifies through the authenticated GitHub API that the merged internal PR head has an identical Git tree and a successful quality workflow.
4. Deploy through `./deploy.sh` from clean, pushed main. The full suite is not rerun. Build/install, migration checks, container health, named sign-in boundaries and deployment smoke checks remain.

For a direct main commit, run Quality gates through GitHub Actions **Run workflow** on main before deploying. Failed or missing CI is not a pass. Rerun a failed job only when investigating its failure; preserve the original result. A newer failed or pending workflow for the same source cannot be hidden by an older successful run.

Release CI verification requires authenticated `gh` with read access to this repository (`gh auth login` or an existing `GH_TOKEN` in the caller environment). No credentials or caller-authored CI receipts are stored in Git. An API/authentication outage blocks verification; it does not start another local suite.

`pnpm quality` remains available for explicit investigation, but agents should not automatically run it before committing, pushing, merging or deploying. Focused local tests are development feedback, not a second full release gate. CI is one workflow run containing the existing quality, database-container and Temporal-service jobs; this policy does not reduce the suite to one individual test.
