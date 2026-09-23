import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

// Load the root .env before modules create clients (ESM import order).
// Priority: .env.local (root) > .env (local) > .env (root)
const localEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const rootEnvLocalPath = fileURLToPath(new URL('../../../.env.local', import.meta.url));

if (existsSync(rootEnvLocalPath)) {
  dotenv.config({ path: rootEnvLocalPath });
}
if (existsSync(localEnvPath)) {
  dotenv.config({ path: localEnvPath });
}
dotenv.config({ path: rootEnvPath });
