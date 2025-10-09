# Repository Guidelines

## Project Structure & Module Organization
Map-View is a Node.js service centered on `server.js`, which routes requests and serves static content. All client assets live in `public/`: `js/main.js` drives the map, `js/configure.js` powers data entry, `css/styles.css` sets layout, and bundled Leaflet files are pinned under `vendor/leaflet/` to keep CDN-free builds repeatable. Persisted asset data lands in `data/Assests.json` (note the legacy spelling), created through the configure UI and ignored by git. Project docs (`README.md`, `AGENTS.md`), smoke checks (`smoke-test.js`), and GitHub Pages settings (`_config.yml`, `config.toml`) sit at the repo root.

## Build, Test, and Development Commands
Run `npm install` once to pull Leaflet. Use `npm run start` (or `npm run dev`) to launch the HTTP server on port 3000. Execute `node smoke-test.js` to validate the happy-path flow: static serving, redirect to `/configure`, POSTing assets, and returning the JSON payload.

## Coding Style & Naming Conventions
Match the existing two-space indentation, semicolon-terminated statements, and `const`/`let` usage shown in `server.js` and `public/js/*.js`. Favor `camelCase` for variables and functions, uppercase snake case for constants such as `MIME_TYPES`, and kebab-case for CSS classes. Write modern JavaScript with `async/await` instead of raw promises, and keep modules self-contained rather than adding global variables. When editing front-end files, colocate helper utilities near the feature they support and add concise comments only when logic is non-obvious.

## Testing Guidelines
Extend coverage by adding focused checks to `smoke-test.js` or creating additional scripts under a future `tests/` directory; mirror the smoke test structure and exit with non-zero codes on failure. New features should include at least one automated request/response assertion and, when touching persistence, verify that temporary data is cleaned after the run (`fs.unlinkSync` mirrors the current smoke flow). Document any manual QA steps in your pull request when automated coverage is impractical.

## Commit & Pull Request Guidelines
Follow the existing git history and start commit subjects with an imperative verb (`Use`, `Update`, `Fix`). Keep messages under 72 characters on the first line, and expand in the body if context is needed. Pull requests should describe the change, reference related issues, list any test commands run, and include screenshots or GIFs for UI adjustments (map view, configure form, toasts). Confirm that generated files like `data/Assests.json` remain untracked and that configuration secrets are never committed.
