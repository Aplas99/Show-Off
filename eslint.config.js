// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    // supabase/functions are Deno modules (npm: imports, Deno globals)
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
