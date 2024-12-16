import { defineConfig } from 'tsup';

export default defineConfig((options) => {
  return {
    entryPoints: ['src/index.ts'],
    sourcemap: true,
    clean: true,
    dts: true,
    minify: !options.watch,
    format: ['cjs', 'esm'],
    outExtension({ format }) {
      return {
        js: `.${format}.js`
      };
    }
  };
});
