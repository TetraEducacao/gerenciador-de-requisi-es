import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';

const localEnvPath = fileURLToPath(new URL('../.env', import.meta.url));
const rootEnvPath = fileURLToPath(new URL('../../../.env', import.meta.url));
const rootEnvLocalPath = fileURLToPath(new URL('../../../.env.local', import.meta.url));


// Load .env.local first (highest priority), then .env, then .env.local at root
if (existsSync(rootEnvLocalPath)) {
    dotenv.config({ path: rootEnvLocalPath });
}
if (existsSync(localEnvPath)) {
    dotenv.config({ path: localEnvPath });
}
dotenv.config({ path: rootEnvPath });
