import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
mkdirSync(new URL('../public/wasm/v1/', import.meta.url), { recursive: true });
const result = spawnSync('wasm-pack', [
  'build', 'crates/cnc-wasm', '--target', 'web', '--release',
  '--out-dir', '../../public/wasm/v1', '--out-name', 'cnc_wasm', '--no-opt',
], { cwd: root, stdio: 'inherit' });
if (result.error) {
  console.error('Se requiere wasm-pack 0.13.1, Rust y el target wasm32-unknown-unknown en PATH.');
  console.error(result.error.message);
}
process.exit(result.status ?? 1);
