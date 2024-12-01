import {defineConfig} from 'tsup';

const config = defineConfig((options) => [
  {
    entry: ['./src/index.ts'],
    format: ['esm', 'cjs'],
    dts: true,
    outDir: './dist',
    target: 'node16',
    clean: true,
    watch: options.watch,
    minify: !options.watch,
  },
]);

export default config;
