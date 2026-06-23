import { defineConfig } from 'vitest/config';
import * as fs from 'fs';
import * as path from 'path';

// Load .env file manually
try {
  const envPath = path.resolve(__dirname, '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf8');
    for (const line of envContent.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const index = trimmed.indexOf('=');
      if (index !== -1) {
        const key = trimmed.substring(0, index).trim();
        let value = trimmed.substring(index + 1).trim();
        if (value.startsWith('"') && value.endsWith('"')) {
          value = value.slice(1, -1);
        } else if (value.startsWith("'") && value.endsWith("'")) {
          value = value.slice(1, -1);
        }
        process.env[key] = value;
      }
    }
  }
} catch (e) {
  console.error('Failed to load .env file:', e);
}

export default defineConfig({
  test: {
    alias: {
      '@director-ai/types': path.resolve(__dirname, './packages/types/index.ts')
    },
    include: [
      'supabase/functions/**/*.test.ts',
      'supabase/functions/**/*.spec.ts',
    ],
    environment: 'node',
    coverage: {
      provider: 'v8',
    },
  },
});

