import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { build, version } from 'vite-plus';

const directory = dirname(fileURLToPath(import.meta.url));
const root = resolve(directory, '../..');
const json = (path) => JSON.parse(readFileSync(path, 'utf8'));
const aliases = {
  usewebmcp: resolve(root, 'packages/usewebmcp/dist/index.js'),
  '@mcp-b/react-webmcp': resolve(root, 'packages/react-webmcp/dist/index.js'),
};
const libraries = ['usewebmcp', '@mcp-b/react-webmcp', 'webmcp-react', 'use-webmcp-tool'].map(
  (library) => ({
    library,
    exportName: library === 'webmcp-react' ? 'useMcpTool' : 'useWebMCP',
  })
);
libraries.push(
  { library: 'usewebmcp', exportName: 'useWebMCPTool' },
  { library: '@mcp-b/react-webmcp', exportName: 'useWebMCPTool' },
  ...Object.entries({
    invocation: 'invoke',
    'standard-schema': 'standardSchema',
    'execution-state': 'createExecutionState',
    consent: 'ConsentBroker',
    otel: 'createOtelMiddleware',
  }).map(([subpath, exportName]) => ({
    library: '@mcp-b/webmcp-polyfill',
    subpath,
    exportName,
  }))
);
const external = (id) => /^(react|react-dom)(\/|$)/.test(id);
const config = { target: 'es2022', format: 'es', minifier: 'oxc', gzipLevel: 9 };
const installedDependencies = json(resolve(directory, 'package.json')).devDependencies;
for (const [name, expected] of Object.entries(installedDependencies)) {
  assert.equal(json(resolve(directory, 'node_modules', name, 'package.json')).version, expected);
}
const samples = [];
for (const { library, subpath, exportName } of libraries) {
  const moduleName = subpath ? `${library}/${subpath}` : library;
  const packageDirectory = aliases[library]
    ? resolve(dirname(aliases[library]), '..')
    : library === '@mcp-b/webmcp-polyfill'
      ? resolve(root, 'packages/webmcp-polyfill')
      : resolve(directory, 'node_modules', library);
  const manifest = json(resolve(packageDirectory, 'package.json'));
  const exported = manifest.exports[subpath ? `./${subpath}` : '.'];
  if (subpath) aliases[moduleName] = resolve(packageDirectory, exported.import);
  const entry = realpathSync(
    aliases[moduleName] ?? resolve(packageDirectory, exported.import ?? exported.default)
  );
  const outputs = [];
  for (const minify of [false, config.minifier]) {
    const virtualEntry = resolve(directory, '__bundle_entry__.js');
    const result = await build({
      configFile: false,
      root: directory,
      mode: 'production',
      logLevel: 'error',
      resolve: { alias: aliases },
      plugins: [
        {
          name: 'hook-entry',
          resolveId: (id) => (id === virtualEntry ? virtualEntry : null),
          load: (id) =>
            id === virtualEntry ? `export { ${exportName} } from '${moduleName}';` : null,
        },
      ],
      build: {
        write: false,
        target: config.target,
        minify,
        sourcemap: false,
        rolldownOptions: {
          input: virtualEntry,
          external,
          preserveEntrySignatures: 'strict',
          output: { format: config.format },
        },
      },
    });
    assert(!Array.isArray(result));
    assert.equal(result.output.length, 1, `${library}: expected one JavaScript bundle`);
    const output = result.output[0];
    assert.equal(output.type, 'chunk');
    assert.deepEqual(output.exports, [exportName]);
    assert(output.moduleIds.includes(entry), `${library}: expected the ESM entry`);
    assert(!output.moduleIds.some((id) => /\/node_modules\/(react|react-dom)\//.test(id)));
    assert(output.imports.every(external), `${library}: unexpected external dependencies`);
    assert.equal(output.dynamicImports.length, 0);
    if (library === 'usewebmcp' || (library === '@mcp-b/webmcp-polyfill' && subpath !== 'otel')) {
      assert(
        !output.moduleIds.some((id) => /(?:opentelemetry|modelcontextprotocol)/.test(id)),
        `${moduleName}: optional SDK leaked into base`
      );
      assert(
        !output.code.includes('initializeWebMCPPolyfill'),
        `${moduleName}: fallback initializer leaked into base`
      );
    }
    outputs.push(output);
  }
  samples.push({
    library,
    ...(subpath && { subpath }),
    version: manifest.version,
    exportName,
    entry: exported.import ?? exported.default,
    rawBytes: Buffer.byteLength(outputs[0].code),
    minifiedBytes: Buffer.byteLength(outputs[1].code),
    gzipBytes: gzipSync(outputs[1].code, { level: config.gzipLevel }).byteLength,
    externalImports: outputs[1].imports,
  });
}
assert.equal(samples.length, libraries.length);
const report = {
  recordedAt: new Date().toISOString(),
  sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim(),
  sourceDirty: Boolean(
    execFileSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).trim()
  ),
  platform: `${process.platform}/${process.arch}`,
  node: process.version,
  bundler: {
    vitePlus: json(resolve(root, 'node_modules/vite-plus/package.json')).version,
    vite: version,
  },
  config: {
    ...config,
    mode: 'production',
    external: ['react', 'react/*', 'react-dom', 'react-dom/*'],
  },
  installedDependencies,
  scope:
    'One tool-hook export; React excluded; built-in dependencies included; no app validator or runtime setup.',
  samples,
};
writeFileSync(resolve(directory, 'bundle-results.json'), `${JSON.stringify(report, null, 2)}\n`);
console.table(
  samples.map(({ library, exportName, rawBytes, minifiedBytes, gzipBytes }) => ({
    library,
    exportName,
    rawBytes,
    minifiedBytes,
    gzipBytes,
  }))
);
