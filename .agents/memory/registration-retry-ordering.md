---
name: Registration retry ordering
description: Protects a saved registration from concurrent retries and uncertain commit acknowledgements.
---

When a registration saves private documents, overlapping requests with the same submission key must be serialized across API instances **before** checking whether uploads are unused. If the database cannot confirm whether a commit completed, retain copied private files rather than risk deleting documents linked to a saved record.

**Why:** A short client timeout can leave the first request working on slow object copies. A retry may then read stale upload state and report failure even though the first request has saved the registration. A lost commit acknowledgement introduces a similar data-loss risk during file cleanup.

**How to apply:** Preserve cross-instance ordering around the entire save, including file copies, if changing the registration workflow. Avoid wording an uncertain server failure as proof that no registration was saved; clients should retry with the same submission key.
