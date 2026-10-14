# Full quality CI prerequisites

The normal GitHub Ubuntu job runs the unchanged `pnpm quality` suite on pushes
to `main` and `codex/**`. These push checks apply to the exact commit presented
in an internal pull request. There is no special one-PR Mac runner route.

The public application repository does not contain private FetchSandbox source.
The `quality-fixtures` GitHub environment permits only branch deployments named
`main` or `codex/**`; tags and pull-request merge refs are not admitted. Its AWS
OIDC role can read one hash-pinned fixture object and cannot write objects or
access the production runtime. No long-lived AWS key is stored in GitHub.
Fork contributions need a maintainer to review the commit and push it to an
internal `codex/**` branch. Until that full check passes, the required check is
missing/blocked, not skipped or counted as passed.

`scripts/quality-fixture-manifest.json` identifies the private archive and its
inventory digest. `scripts/quality-fixtures.mjs` refuses changed archives,
unlisted files, links and traversal paths before using their contents. The bundle
contains only the pinned provider test source/Git objects, authenticated historical
chat compilation and intake, and exact previously measured discovery build bytes.
The original admission/source/provenance tests still validate these artifacts;
restoring prerequisites does not create new proof or confer execution authority.

CI installs Chromium, an isolated pinned Python environment and PostgreSQL 17
archive tools matching its PostgreSQL 17 service. Temporary AWS credentials are
cleared before Python setup and the application tests. The unchanged gate builds
both workflow bundles, runs every test with existing coverage thresholds, performs
the database refusal proof, builds the app and checks rendered links.

The source-construction test and four two-origin filesystem/mock-Docker drills
have 30-second setup deadlines for repeated current-source/TypeScript closure
traversals on shared runners. Their dependency, omission, cold-load, tamper and
cleanup assertions remain unchanged. Product-operation deadlines are unchanged.

If the pinned provider or measured artifacts change, prepare and authenticate a
new private bundle, update its inventory and object digests, and grant the role
access to that exact object. Never replace an unavailable artifact with a
synthetic success receipt or remove the corresponding tests.
