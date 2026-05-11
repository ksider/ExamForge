# Local Test Builder

This folder contains a local-only CLI for creating and validating test JSON files.

It is intentionally excluded from static builds.

## Commands

```bash
node tools/builder/cli.js list
node tools/builder/cli.js new --title="Language Test 7" --id=test_7 --examType=general
node tools/builder/cli.js duplicate --from=test_1.json --id=test_7
node tools/builder/cli.js import --file=work/drafts/test_7.json
node tools/builder/cli.js validate --file=tests/test_1.json
```

## Notes

- Drafts are written to `work/drafts/`.
- Imported files are written to `tests/`.
- The builder validates the fixed section ids and question types used by the exam app.
