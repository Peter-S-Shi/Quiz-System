# Contributing

Quiz Studio is currently a local-first static web app. Contributions should keep the app private-data-safe, bilingual, and easy to run without a backend.

## Development

1. Serve the repository with a local static server.
2. Open `index.html` in a browser through that server.
3. Run checks before committing:

```bash
npm test
npm run check
```

## Guidelines

- Keep user-facing interface text available in both Chinese and English.
- Put reusable quiz behavior in `src/core/` instead of directly in UI code.
- Do not commit real quiz data, personal data, local paths, secrets, or exported user backups.
- Use synthetic examples in `examples/`.
- Update `DEVLOG.md` and milestone documentation for substantive changes.
