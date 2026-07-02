# Dev.to Cover — Mandatory Spec (AgentGovernance)

**Rule:** Every Dev.to draft ships with a **PNG cover**. **Never ask the user.**

**Dev.to does not accept SVG — upload PNG only.**

## File naming

- PNG (upload): `docs/devto/covers/week-NN-<slug>-cover.png`
- Optional SVG source: same path with `.svg` for edits only
- Frontmatter: `cover_image: ./covers/week-NN-<slug>-cover.png`

## Export SVG → PNG (macOS)

```bash
qlmanage -t -s 1600 -o docs/devto/covers docs/devto/covers/week-NN-<slug>-cover.svg
mv docs/devto/covers/week-NN-<slug>-cover.svg.png docs/devto/covers/week-NN-<slug>-cover.png
```

## Dimensions

1600×900 PNG · dark bg `#0c0c10` · accent indigo `#818cf8`

## Required elements

1. Category pill: AI governance / Privacy / Industry name
2. Two-line hook (business language — no "policy engine")
3. One concrete scenario line (email, CRM, approval)
4. Optional: approval queue / blocked badge
5. `agentgovern.ai` footer
