# Contributing

This project is a VS Code extension written in TypeScript and built with pnpm and the TypeScript compiler.

## Quick start

1. Clone the repo and install dependencies.
   - `pnpm install`
2. Compile the extension.
   - `pnpm run compile`
3. Run the extension in VS Code.
   - Open the repo in VS Code.
   - Press F5 to launch the Extension Development Host.

## Common scripts

- `pnpm run compile` builds the extension and webview bundle.
- `pnpm run watch` rebuilds on file changes.

## Project structure

- `src/extension.ts` is the extension entrypoint.
- `src/webview` contains the webview UI.
- `src/fileTracking` contains file tracking logic.

## Making changes

- Keep changes focused and minimal.
- Prefer small, reviewable pull requests.
- Match existing TypeScript style and naming conventions.
- Update documentation when behavior or configuration changes.

## Submitting changes

- Describe the problem and the reason for the change.
- Include steps to verify, even if they are manual.
- If you add a new setting or command, update `package.json` and the relevant docs.
- Please open an issue before making a PR so we can discuss wether or not it is relevant.

## Reporting issues

- Include the VS Code version, extension version, and OS.
- Provide a short reproduction path and expected behavior.
