// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions are Deno modules (npm: imports, Deno globals);
    // server/paddleocr is a Python service (its .venv contains JS artifacts)
    ignores: ['dist/*', '.claude/**', 'supabase/functions/**', 'server/paddleocr/**'],
  },
]);
