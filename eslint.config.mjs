import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixupConfigRules, includeIgnoreFile} from '@eslint/compat';
import {FlatCompat} from '@eslint/eslintrc';
import biome from 'eslint-config-biome';
import tseslint from 'typescript-eslint';

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default tseslint.config(
  includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
  {
    files: ['src/**/*.ts', 'tests/*.ts'],
  },
  ...fixupConfigRules(compat.extends('plugin:graphile-export/recommended')),
  tseslint.configs.base,
  biome,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs'],
        },
      },
    },
  }
);
