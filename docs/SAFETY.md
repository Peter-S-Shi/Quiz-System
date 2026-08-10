# Safety And Privacy

Quiz Studio is local-first. The current static version does not send quiz data to a server.

## Commit Safety

Do not commit:

- Real quiz papers from users.
- Personal information.
- Local machine paths.
- API keys, tokens, passwords, cookies, private keys, or `.env` files.
- Browser exports, backups, logs, caches, local databases, or virtual environments.

## Public Examples

Public examples must be synthetic. Use `examples/` for safe sample quiz files and `schemas/` for public schemas.

## Local-Only Data

Use ignored folders such as `user-data/` and `exports/` for real local quiz data or backups.

Learner Response exports contain original submitted answers and material snapshots. Teacher Review files may contain comments or learning diagnoses. Treat both as private learner data unless they contain synthetic examples only.

External-teacher interchange is file based. Quiz Studio does not automatically upload exported files or require reviewer account identifiers. Review every file before sharing it and prefer anonymous or synthetic reviewer labels when real identity is unnecessary.
