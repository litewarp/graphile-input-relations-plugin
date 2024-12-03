import {loadEnv} from 'vite';
import {defineConfig} from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      'graphql/language/printer': 'graphql/language/printer.js',
      'graphql/language': 'graphql/language/index.js',
      graphql: 'graphql/index.js',
    },
  },
  test: {
    env: loadEnv('', process.cwd(), ''),
  },
});
