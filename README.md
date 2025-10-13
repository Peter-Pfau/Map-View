# Map-View

Map-View is a lightweight Node.js application that lets you enter IT assets, persist them on disk, and visualize their locations on an interactive Leaflet map.

## Current State
- Node HTTP server in `server.js` serves static assets and a small JSON API.
- Asset data is stored in `data/Assests.json`; the file is created via the configure UI.
- `/` renders the map with markers, `/configure` provides the asset editor, `/api/assets` exposes GET/POST endpoints.
- Front-end bundles live under `public/`, including Leaflet (vendor copy), UI scripts, and shared styling.
- A smoke test (`node smoke-test.js`) exercises the happy-path API flow.

## Prerequisites
- Node.js 18+ (required for the native `fetch` used by the geocoder and for modern browser features).
- npm (only used to install the declared `leaflet` dependency; the server itself has no runtime packages).

## Setup & Usage
1. Install dependencies: `npm install`.
2. Start the server: `npm run start` (defaults to `http://localhost:3000`).
3. On first run you will be redirected to `/configure` to create the asset list; submitting the form writes `data/Assests.json`.
4. Return to `/` to see the map, asset list, and toast notifications for any issues.

### Editing Assets
- Use the **Configure Assets** button (or browse to `/configure`) to add, edit, or remove entries.
- Every asset requires `name`, `city`, and `state`; `notes` is optional but persisted.
- Saving posts the payload to `/api/assets` and immediately redirects back to the map view.

### Remote Asset Sources
- Toggle **Fetch asset list from JSON API** on the configure page to sync markers from a remote endpoint.
- When enabled, the server stores the endpoint metadata alongside any locally defined assets and validates that the URL uses `http` or `https`.
- The map will attempt to load data from the remote URL on each visit; if the call fails it falls back to the last saved asset file.
- For quick testing, point the field at `http://localhost:3000/api/test-assets` which returns 20 sample assets.

### Data File Format
```json
{
  "title": "Example Map Title",
  "assets": [
    { "name": "Primary DC", "city": "Seattle", "state": "WA", "notes": "Edge location" }
  ]
}
```
- The server validates incoming payloads and rejects missing required fields.
- The JSON file can be edited by hand, but the UI is the recommended workflow.

### Geocoding & Map Behavior
- Asset coordinates are geocoded on demand through OpenStreetMap's Nominatim service; outbound network access is required for marker placement.
- Results are cached in `localStorage` per browser session to limit repeat lookups.
- If geocoding fails, the app still lists assets and shows an inline toast explaining the issue.

## Development Notes
- `public/js/main.js` drives the map experience; `public/js/configure.js` powers the configuration form.
- Static styling lives in `public/css/styles.css` with responsive layouts for narrower viewports.
- Run `node smoke-test.js` to confirm the server handles redirects, POST validation, and asset persistence without touching existing data.

## Known Gaps & Next Steps
- No authentication: anyone with access to the server can overwrite `Assests.json`.
- Geocoding rate limits and failures are not surfaced beyond toasts; consider server-side caching or status indicators.
- Tests currently cover only the core happy path; expand coverage for validation errors and static asset responses as the project grows.
