# Run LoopLabs locally on Ubuntu, WSL2 or macOS

Use this path for UI and scoped workspace development. It creates a dedicated local PostgreSQL instance with verified TLS, installs the existing tenant roles/migrations, and creates two synthetic members. No production database, cloud identity or provider account is needed.

On Windows, run these commands inside Ubuntu under WSL2 as your normal user. Keep the checkout under `/home/<you>/`, not `/mnt/c`. Native Windows and running setup with sudo are unsupported.

## Install prerequisites

Use Node.js 22 and the repository's pinned pnpm 10.32.1. Inside Ubuntu:

```sh
sudo apt-get update
sudo apt-get install -y postgresql postgresql-contrib libpq-dev openssl
```

`pg_config --bindir` must point to a directory containing `initdb` and `pg_ctl`. On macOS, install PostgreSQL 17 and OpenSSL through Homebrew and put PostgreSQL's bin directory on PATH.

## Set up and start

From the repository root:

```sh
pnpm install --frozen-lockfile
pnpm dev:setup
pnpm dev:local
```

Open **http://localhost:3007/control-plane**. The app binds only to loopback. Both test logins and their generated passwords are in:

```sh
cat .local/development/accounts.json
```

Use `requester@example.test` in one browser profile and `reviewer@example.test` in a separate profile or private window. These are local test users, not accounts on looplabs.run. Keep the generated passwords private.

`dev:setup` generates `LOOPLABS_TENANT_WEB_CONFIG`'s target and its matching readiness record using the existing tenant installer. `dev:local` sets the path for the child server. It does not overwrite `.env.local`, copy production configuration, or disable startup/TLS/tenant checks. `pnpm dev` alone still requires a separately installed tenant publication.

Repeated setup preserves the accounts and checks the existing installation. If setup stops halfway, it refuses to overwrite the partial installation on retry. Read the private PostgreSQL log and preserve the directory for diagnosis; do not delete files from a running installation.

## Existing twin and limits

If your connector twin already runs, keep its existing loopback `LOOPLABS_CONNECTOR_TWIN_URL` and token in `.env.local`. The launcher accepts a local HTTP twin only; hosted bindings, AWS identities, planners and background workers are not activated. Remove old explicit `LOOPLABS_WORKSPACE_ID` or `LOOPLABS_RECOVERY_EPOCH` entries and unset `LOOPLABS_DEPLOYMENT_PROFILE` before using this separate local setup; a different configured authority fence or deployment restriction must not be silently overridden.

This starts the scoped web workspace, not a complete workflow rehearsal. Existing twin preparation is separate. Native AWS discovery, model planning, background execution, live CRM/email delivery and cancellation/refund acceptance are not established by this setup. An empty inventory is expected until local test agents/records are enrolled.

Generated files stay in ignored `.local/development/`: private publications, local database, CA and two test accounts. The database listens only on localhost at a generated port and accepts TCP connections only with TLS. Certificates last 30 days. Expired TLS or source/migration changes require a reviewed new local installation; do not disable certificate verification or reuse stale authority.

## Stop and troubleshoot

Stop Next with Ctrl+C. To stop the dedicated database while retaining local data:

```sh
pnpm dev:stop
```

`dev:local` restarts that database on the next launch.

- **Scoped server installation unavailable:** use `dev:setup`, then `dev:local`. An empty JSON file is not an installation.
- **Private directory refused:** generated directories must belong to your Ubuntu/macOS user with mode 700; files use mode 600. Do not copy Windows-mounted files or use sudo.
- **PostgreSQL tools missing:** install the server package, not only the client. Check `pg_config --bindir`.
- **Database startup refused:** inspect `.local/development/postgres.log`; no other database is adopted or modified.
- **Partial setup:** preserve its directory and share only a sanitized error, never account/config/CA-key files.

For focused UI/unit work, `pnpm exec vitest run <test-file>` does not need Next running. Database/integration suites still require their dedicated test prerequisites.
