import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const sentinelPath = path.join(root, '.build', 'generated', 'data', 'navigation.json');

if (!fs.existsSync(sentinelPath)) {
  console.error(
    '\nMissing build artifacts. Run `npm run build` first to generate content bundles.\n' +
    `Expected: ${sentinelPath}\n`
  );
  process.exit(1);
}
