#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, '..');
const packagesDir = path.join(repoRoot, 'packages');
const tempDirPrefix = path.join(tmpdir(), 'mcpb-hooks-tarball-');
const targetPackages = ['@mcp-b/react-webmcp', 'usewebmcp'];

function runCommand(command, args, cwd = repoRoot) {
  const printable = [command, ...args].join(' ');
  console.log(`\n> ${printable}`);

  const result = spawnSync(command, args, {
    cwd,
    env: process.env,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status}): ${printable}`);
  }
}

function getPnpmStoreDir() {
  const modulesYamlPath = path.join(repoRoot, 'node_modules/.modules.yaml');

  try {
    const modulesYaml = readFileSync(modulesYamlPath, 'utf8');
    const match = modulesYaml.match(/^storeDir:\s*(.+)$/m);
    if (match?.[1]) {
      return match[1].trim();
    }
  } catch (err) {
    console.warn('Could not read .modules.yaml, falling back to CLI:', err.message);
  }

  const result = spawnSync('pnpm', ['store', 'path'], {
    cwd: repoRoot,
    env: process.env,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error('Failed to determine pnpm store path');
  }

  return result.stdout.trim();
}

async function loadWorkspacePackages() {
  const entries = await readdir(packagesDir, { withFileTypes: true });
  const packages = new Map();

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const packageJsonPath = path.join(packagesDir, entry.name, 'package.json');
    if (!existsSync(packageJsonPath)) {
      continue;
    }

    const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'));
    packages.set(packageJson.name, {
      dir: path.join('packages', entry.name),
      packageJson,
    });
  }

  return packages;
}

function collectWorkspaceDeps(packageNames, workspacePackages) {
  const seen = new Set();

  const visit = (packageName) => {
    if (seen.has(packageName)) {
      return;
    }

    const pkg = workspacePackages.get(packageName);
    if (!pkg) {
      throw new Error(`Workspace package not found: ${packageName}`);
    }

    seen.add(packageName);

    for (const [depName, version] of Object.entries(pkg.packageJson.dependencies || {})) {
      if (typeof version === 'string' && version.startsWith('workspace:')) {
        visit(depName);
      }
    }
  };

  for (const packageName of packageNames) {
    visit(packageName);
  }

  return seen;
}

function topologicalSort(packageNames, workspacePackages) {
  const visited = new Set();
  const visiting = new Set();
  const ordered = [];

  const visit = (packageName) => {
    if (visited.has(packageName)) {
      return;
    }

    if (visiting.has(packageName)) {
      throw new Error(`Cycle detected while sorting workspace packages: ${packageName}`);
    }

    const pkg = workspacePackages.get(packageName);
    if (!pkg) {
      throw new Error(`Workspace package not found: ${packageName}`);
    }

    visiting.add(packageName);

    for (const [depName, version] of Object.entries(pkg.packageJson.dependencies || {})) {
      if (typeof version === 'string' && version.startsWith('workspace:')) {
        visit(depName);
      }
    }

    visiting.delete(packageName);
    visited.add(packageName);
    ordered.push(packageName);
  };

  for (const packageName of packageNames) {
    visit(packageName);
  }

  return ordered;
}

function normalizeTarballSlug(packageName) {
  if (!packageName.startsWith('@')) {
    return packageName.replace(/\//g, '-');
  }

  return packageName.slice(1).replace(/\//g, '-');
}

function createConsumerPackageJson(name, overrides) {
  return {
    name,
    private: true,
    type: 'module',
    packageManager: 'pnpm@10.14.0',
    pnpm: {
      overrides,
    },
  };
}

function createTsConfig() {
  return {
    compilerOptions: {
      target: 'ES2022',
      module: 'ESNext',
      moduleResolution: 'Bundler',
      jsx: 'react-jsx',
      strict: true,
      noEmit: true,
      skipLibCheck: true,
      lib: ['ES2022', 'DOM'],
    },
    include: ['src/**/*.ts'],
  };
}

function createReactWebMcpZod3ConsumerSource() {
  return `import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;

const jsonInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  required: ['name'],
} as const;

const zodInputSchema = {
  username: z.string(),
  age: z.number().optional(),
};

const jsonOutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
  },
  required: ['total'],
} as const;

const zodOutputSchema = {
  label: z.string(),
};

export function TarballReactWebMcpZod3Consumer() {
  const jsonTool = useWebMCP({
    name: 'json_tool',
    description: 'JSON Schema input',
    inputSchema: jsonInputSchema,
    handler: async (input) => {
      const name: string = input.name;
      const count: number | undefined = input.count;
      return { greeting: name, count: count ?? 0 };
    },
  });

  const zodTool = useWebMCP({
    name: 'zod_tool',
    description: 'Zod v3 input',
    inputSchema: zodInputSchema,
    handler: async (input) => {
      const username: string = input.username;
      const age: number | undefined = input.age;
      return { username, age: age ?? 0 };
    },
  });

  const jsonOutputTool = useWebMCP({
    name: 'json_output_tool',
    description: 'JSON Schema output',
    outputSchema: jsonOutputSchema,
    handler: async () => ({ total: 1 }),
  });

  const zodOutputTool = useWebMCP({
    name: 'zod_output_tool',
    description: 'Zod v3 output',
    outputSchema: zodOutputSchema,
    handler: async () => ({ label: 'ok' }),
  });

  type JsonLastResult = typeof jsonTool.state.lastResult;
  type ZodLastResult = typeof zodTool.state.lastResult;
  type JsonOutputLastResult = typeof jsonOutputTool.state.lastResult;
  type ZodOutputLastResult = typeof zodOutputTool.state.lastResult;

  const jsonResultAssertion: Assert<IsEqual<JsonLastResult, unknown | null>> = true;
  const zodResultAssertion: Assert<IsEqual<ZodLastResult, unknown | null>> = true;
  const jsonOutputAssertion: Assert<
    IsEqual<JsonOutputLastResult, { total: number } | null>
  > = true;
  const zodOutputAssertion: Assert<IsEqual<ZodOutputLastResult, { label: string } | null>> =
    true;

  const maybeTotal: number | undefined = jsonOutputTool.state.lastResult?.total;
  const maybeLabel: string | undefined = zodOutputTool.state.lastResult?.label;

  return {
    jsonResultAssertion,
    zodResultAssertion,
    jsonOutputAssertion,
    zodOutputAssertion,
    maybeTotal,
    maybeLabel,
  };
}
`;
}

function createReactWebMcpZod4ConsumerSource() {
  return `import { useWebMCP } from '@mcp-b/react-webmcp';
import { z } from 'zod';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;

const jsonInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  required: ['name'],
} as const;

const standardInputSchema = z.object({
  slug: z.string(),
  page: z.number().optional(),
});

const jsonOutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
  },
  required: ['total'],
} as const;

export function TarballReactWebMcpZod4Consumer() {
  const jsonTool = useWebMCP({
    name: 'json_tool',
    description: 'JSON Schema input',
    inputSchema: jsonInputSchema,
    handler: async (input) => {
      const name: string = input.name;
      const count: number | undefined = input.count;
      return { greeting: name, count: count ?? 0 };
    },
  });

  const standardTool = useWebMCP({
    name: 'standard_tool',
    description: 'Zod v4 Standard Schema input',
    inputSchema: standardInputSchema,
    handler: async (input) => {
      const slug: string = input.slug;
      const page: number | undefined = input.page;
      return { slug, page: page ?? 1 };
    },
  });

  const outputTool = useWebMCP({
    name: 'output_tool',
    description: 'JSON Schema output',
    outputSchema: jsonOutputSchema,
    handler: async () => ({ total: 1 }),
  });

  type JsonLastResult = typeof jsonTool.state.lastResult;
  type StandardLastResult = typeof standardTool.state.lastResult;
  type OutputLastResult = typeof outputTool.state.lastResult;

  const jsonResultAssertion: Assert<IsEqual<JsonLastResult, unknown | null>> = true;
  const standardResultAssertion: Assert<IsEqual<StandardLastResult, unknown | null>> = true;
  const outputAssertion: Assert<IsEqual<OutputLastResult, { total: number } | null>> = true;

  const maybeTotal: number | undefined = outputTool.state.lastResult?.total;

  return {
    jsonResultAssertion,
    standardResultAssertion,
    outputAssertion,
    maybeTotal,
  };
}
`;
}

function createUseWebMcpConsumerSource() {
  return `import { useWebMCP } from 'usewebmcp';
import { z } from 'zod';

type IsEqual<Left, Right> = [Left] extends [Right]
  ? [Right] extends [Left]
    ? true
    : false
  : false;

type Assert<T extends true> = T;

const jsonInputSchema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    count: { type: 'number' },
  },
  required: ['name'],
} as const;

const standardInputSchema = z.object({
  slug: z.string(),
  page: z.number().optional(),
});

const jsonOutputSchema = {
  type: 'object',
  properties: {
    total: { type: 'number' },
  },
  required: ['total'],
} as const;

export function TarballUseWebMcpConsumer() {
  const jsonTool = useWebMCP({
    name: 'json_tool',
    description: 'JSON Schema input',
    inputSchema: jsonInputSchema,
    handler: async (input) => {
      const name: string = input.name;
      const count: number | undefined = input.count;
      return { greeting: name, count: count ?? 0 };
    },
  });

  const standardTool = useWebMCP({
    name: 'standard_tool',
    description: 'Standard Schema input',
    inputSchema: standardInputSchema,
    execute: async (input) => {
      const slug: string = input.slug;
      const page: number | undefined = input.page;
      return { slug, page: page ?? 1 };
    },
  });

  const outputTool = useWebMCP({
    name: 'output_tool',
    description: 'JSON Schema output',
    outputSchema: jsonOutputSchema,
    execute: async () => ({ total: 1 }),
  });

  type JsonLastResult = typeof jsonTool.state.lastResult;
  type StandardLastResult = typeof standardTool.state.lastResult;
  type OutputLastResult = typeof outputTool.state.lastResult;

  const jsonResultAssertion: Assert<IsEqual<JsonLastResult, unknown | null>> = true;
  const standardResultAssertion: Assert<IsEqual<StandardLastResult, unknown | null>> = true;
  const outputAssertion: Assert<IsEqual<OutputLastResult, { total: number } | null>> = true;

  const maybeTotal: number | undefined = outputTool.state.lastResult?.total;

  return {
    jsonResultAssertion,
    standardResultAssertion,
    outputAssertion,
    maybeTotal,
  };
}
`;
}

async function writeConsumerProject(projectDir, packageJson, sourceFiles) {
  const srcDir = path.join(projectDir, 'src');
  await mkdir(srcDir, { recursive: true });
  await writeFile(
    path.join(projectDir, 'package.json'),
    `${JSON.stringify(packageJson, null, 2)}\n`
  );
  await writeFile(
    path.join(projectDir, 'tsconfig.json'),
    `${JSON.stringify(createTsConfig(), null, 2)}\n`
  );
  await writeFile(path.join(projectDir, '.gitignore'), 'node_modules\n');

  await Promise.all(
    Object.entries(sourceFiles).map(([fileName, source]) =>
      writeFile(path.join(srcDir, fileName), source)
    )
  );
}

async function runConsumerTypecheck({ projectDir, packageJson, installArgs, sourceFiles }) {
  await writeConsumerProject(projectDir, packageJson, sourceFiles);
  runCommand('pnpm', ['add', ...installArgs], projectDir);
  runCommand('pnpm', ['exec', 'tsc', '--noEmit'], projectDir);
}

async function main() {
  const workspacePackages = await loadWorkspacePackages();
  const packageClosure = collectWorkspaceDeps(targetPackages, workspacePackages);
  const buildOrder = topologicalSort(packageClosure, workspacePackages);
  const pnpmStoreDir = getPnpmStoreDir();
  let tempDir;

  try {
    tempDir = await mkdtemp(tempDirPrefix);

    for (const packageName of buildOrder) {
      const pkg = workspacePackages.get(packageName);
      runCommand('pnpm', ['-C', pkg.dir, 'build']);
      runCommand('pnpm', ['-C', pkg.dir, 'pack', '--pack-destination', tempDir]);
    }

    const tarballMap = new Map();
    const tarballs = (await readdir(tempDir)).filter((fileName) => fileName.endsWith('.tgz'));

    for (const packageName of buildOrder) {
      const slug = normalizeTarballSlug(packageName);
      const fileName = tarballs.find((candidate) => candidate.startsWith(`${slug}-`));
      if (!fileName) {
        throw new Error(`Tarball not found for ${packageName} in ${tempDir}`);
      }
      tarballMap.set(packageName, path.join(tempDir, fileName));
    }

    const reactWebMcpTarball = tarballMap.get('@mcp-b/react-webmcp');
    const useWebMcpTarball = tarballMap.get('usewebmcp');
    if (!reactWebMcpTarball || !useWebMcpTarball) {
      throw new Error('Target hook package tarballs were not created successfully');
    }

    const baseOverrides = Object.fromEntries(
      [...tarballMap.entries()]
        .filter(([packageName]) => !targetPackages.includes(packageName))
        .map(([packageName, tarballPath]) => [packageName, `file:${tarballPath}`])
    );

    await runConsumerTypecheck({
      projectDir: path.join(tempDir, 'react-webmcp-zod3'),
      packageJson: createConsumerPackageJson('mcpb-react-webmcp-zod3-consumer', baseOverrides),
      installArgs: [
        reactWebMcpTarball,
        'react@19',
        'react-dom@19',
        '@types/react@19',
        'typescript@5',
        'zod@3',
        'zod-to-json-schema@3',
        '--ignore-scripts',
        '--store-dir',
        pnpmStoreDir,
      ],
      sourceFiles: {
        'react-webmcp-zod3-consumer.ts': createReactWebMcpZod3ConsumerSource(),
      },
    });

    await runConsumerTypecheck({
      projectDir: path.join(tempDir, 'react-webmcp-zod4'),
      packageJson: createConsumerPackageJson('mcpb-react-webmcp-zod4-consumer', baseOverrides),
      installArgs: [
        reactWebMcpTarball,
        'react@19',
        'react-dom@19',
        '@types/react@19',
        'typescript@5',
        'zod@4',
        'zod-to-json-schema@3',
        '--ignore-scripts',
        '--store-dir',
        pnpmStoreDir,
      ],
      sourceFiles: {
        'react-webmcp-zod4-consumer.ts': createReactWebMcpZod4ConsumerSource(),
      },
    });

    await runConsumerTypecheck({
      projectDir: path.join(tempDir, 'usewebmcp'),
      packageJson: createConsumerPackageJson('mcpb-usewebmcp-consumer', baseOverrides),
      installArgs: [
        useWebMcpTarball,
        'react@19',
        'react-dom@19',
        '@types/react@19',
        'typescript@5',
        'zod@4',
        '--ignore-scripts',
        '--store-dir',
        pnpmStoreDir,
      ],
      sourceFiles: {
        'usewebmcp-consumer.ts': createUseWebMcpConsumerSource(),
      },
    });

    console.log('\nTarball consumer type validation passed for hook packages.');
  } finally {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}

await main();
