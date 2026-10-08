---
name: Organizer test isolation
description: Why organizer regression fixtures must never enter a shared application database.
---

Run organizer regression fixtures in an isolated PostgreSQL-compatible database, not the application's shared development or production database.

**Why:** Synthetic notification jobs in a shared database can be claimed by an independently running email worker. A test-only identity or fake recipient alone does not isolate those side effects.

**How to apply:** Keep database/session fixtures and external-service replacements inside the test process. Do not seed real organizer accounts or use a development authentication backdoor.
