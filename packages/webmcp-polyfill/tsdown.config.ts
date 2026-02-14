import type { Options } from 'tsdown';

const config: Options = {
  entry: {
    index: 'src/index.ts',
  },
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  target: 'esnext',
  platform: 'browser',
  tsconfig: './tsconfig.json',
  outDir: 'dist',
};

export default config;
