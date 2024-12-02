import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {fixupConfigRules, includeIgnoreFile} from '@eslint/compat';
import {FlatCompat} from '@eslint/eslintrc';
import tseslint from 'typescript-eslint';

// mimic CommonJS variables -- not needed if using CommonJS
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

export default tseslint.config(
  includeIgnoreFile(path.resolve(__dirname, '.gitignore')),
  ...fixupConfigRules(compat.extends('plugin:graphile-export/recommended')),
  ...fixupConfigRules(compat.extends('biome')),
  tseslint.configs.recommendedTypeCheckedOnly,
  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: ['*.mjs'],
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          args: 'all',
          argsIgnorePattern: '^_',
          caughtErrors: 'all',
          caughtErrorsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },
  {
    files: ['src/**/*.ts', 'tests/*.ts'],
  }
);
