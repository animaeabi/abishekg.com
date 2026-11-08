import { cp, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

// Ship the exact, unmodified licensed runtime with the site. No runtime CDN,
// account, API key, subscription, or camera upload is required.
const root = new URL('../', import.meta.url);
const source = new URL('node_modules/@8thwall/engine-binary/dist/', root);
// Versioned URLs allow immutable caching without trapping a future upgrade.
const target = new URL('public/namma-vedis/xr/1.0.0/', root);
await mkdir(target, { recursive: true });
for (const path of ['xr.js', 'xr-slam.js', 'resources', 'LICENSE']) {
  await cp(fileURLToPath(new URL(path, source)), fileURLToPath(new URL(path, target)), { recursive: true });
}
