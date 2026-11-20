# Repository guide

## Documentation

- Update [README.md](./README.md) and affected consumer examples in
  `test/examples.tsx` when the public API or its usage changes.
- Write release notes in `.changeset/*.md` for each releasable change instead
  of editing `CHANGELOG.md` directly.
    - Include the package name, a `patch`, `minor`, or `major` bump, and a
      user-facing summary in each changeset.
    - Skip changesets for changes that do not need a release; never create an
      empty changeset, including with `changeset add --empty`.

## Code style

- In `src/`, use `.js` extensions for relative imports of TypeScript modules so
  Node.js can resolve the compiled files.

## Commands

- Run `npm ci` from the repository root with the Node.js and npm versions in
  [`package.json`](./package.json).

## Boundaries

- Edit the build inputs, not `dist/`: `npm run build` replaces it with compiled
  code and copies of `src/styles.css` and `src/styles.css.d.ts`.
- Keep `src/core/` importable in Node.js without React, renderers, or browser
  globals at import time.
- Leave versioning and publishing to the
  [release workflow](./.github/workflows/release.yml) unless explicitly
  authorized to run them.

## Security

- Keep diagram rendering and SVG sanitization in the host, and render diagram
  source as text, not HTML.

## Testing

- Run `npm run ci` for source or package changes; it includes the packed-consumer
  check, which requires Playwright Chromium.
- Run `npm run test:browser` for browser behavior changes; on WSL, verify the
  Wayland connection before either Chromium suite runs.
