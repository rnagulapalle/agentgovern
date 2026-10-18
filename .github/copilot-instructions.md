# LoopLabs Copilot instructions

Treat the root `AGENTS.md` as the engineering contract. Follow `.agents/skills/looplabs-engineering/SKILL.md` for all changes. Keep public claims within `docs/LOOPLABS_CLAIM_AND_FUNNEL_AUDIT.md`, add adversarial tests for behavior changes, and run focused local tests. Full `pnpm quality` runs once in GitHub CI, not again locally or during deployment. Never bypass a gate or deploy outside `./deploy.sh`.
