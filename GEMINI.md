# Gemini and Antigravity project instructions

Read and follow `AGENTS.md` before changing this repository. Use `.agents/skills/looplabs-engineering/SKILL.md` for the change workflow. Product claims must stay within `docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md`.

Run focused local checks; the full `pnpm quality` suite runs once in GitHub CI per candidate source revision. Reuse identical-source CI evidence during deployment; do not rerun the full suite locally. Never bypass a failing gate or deploy outside `./deploy.sh`.
