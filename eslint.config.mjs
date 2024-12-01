import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixupConfigRules} from '@eslint/compat';
import {FlatCompat} from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default tseslint.config(
  {
    files: ['packages/nested-mutations-plugin/src/**/*.ts'],
  },
  tseslint.configs.base,
  ...fixupConfigRules(compat.extends('plugin:graphile-export/recommended'))
);
