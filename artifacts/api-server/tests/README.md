# Private organizer API regression checks

Run from the repository root:

```sh
pnpm --filter @workspace/api-server run test:admin
```

No database URL, organizer account, session secret, email integration, object
storage, or running application is required. The command uses Node's built-in
test runner and the existing esbuild toolchain.

To also prove that the checks catch the original SQL qualification bug:

```sh
pnpm --filter @workspace/api-server run test:admin --verify-sql-regression
```

This first runs the normal suite, then removes the outer-column qualification
from a **temporary test bundle only**. The list and detail checks must fail with
HTTP 500 instead of 200 in that negative control. The command succeeds only when
the normal checks pass and the mutated version fails. Expected failure output in
the second phase is not an application failure.

For the normal workspace type checks (including these tests):

```sh
pnpm run typecheck
```

## Coverage

- The actual Express organizer router and actual organizer authorization helper.
- PostgreSQL UUID/integer semantics, including rejection of an unqualified
  `registration_id = id` comparison.
- Correlated SQL projections with multiple registrations, different captains,
  reverse member insertion order, integer member counts, and empty-team fallback.
- All five list/detail notification states: `sent`, `pending`, `processing`,
  `failed`, and `not_requested`, with attempts, errors, and nullable timestamps.
- Search by reference, team, institution, captain, and other members; case
  insensitivity, literal `%`, `_`, and backslash, no results, and whitespace.
- Pagination across 21 fixtures, defaults, empty later pages, invalid input,
  invalid UUID, and a missing registration.
- Responses checked against generated `@workspace/api-zod` contracts from
  `lib/api-spec/openapi.yaml`, with exact wire values and field sets. Contact and
  document metadata appear in authorized detail responses, not list summaries.
- Anonymous/invalid-session 401 and participant/email-less-session 403 on list,
  detail, document, and retry routes. Denials must have only the expected error
  body and execute no database queries, even with spoofed identity headers or
  query parameters.
- Access checks, normalized organizer email, cross-origin rejection, private
  cache headers, no email/storage calls, and unchanged synthetic outbox records.

## Isolation and cleanup

`fixtures/database.ts` uses PGlite's embedded PostgreSQL engine in memory, with
Drizzle's PostgreSQL SQL generation. DDL is generated from the real shared
Drizzle table definitions using the existing drizzle-kit version; there is no
hand-maintained copy of the table schema or mock query result.

`run-admin.mjs` replaces the production database import at build time. It also
replaces email/storage functions with test-only functions that throw on use and
count calls. The router and authorization helper themselves are **not** mocked.
A bundle guard rejects imports of the production database, session middleware
support, notification delivery, and object-storage modules.

The child process receives a minimal test environment, not the workspace's DB
connection, real allowlist, credentials, or session settings. The test HTTP
server binds to an ephemeral loopback port. Synthetic session fixtures are
defined only in this harness and use reserved `example.invalid` addresses;
they do not add any authentication bypass to the running app.

Teardown closes the HTTP server and discards the in-memory database. The runner
removes only its uniquely named temporary bundle directory, including on test
failure. It performs no cleanup against development or production data and
never calls the email worker, retries email as an organizer, or downloads files.

These checks deliberately cover the organizer read/authorization boundaries,
not real OIDC sign-in, external email delivery, or actual document downloads.
