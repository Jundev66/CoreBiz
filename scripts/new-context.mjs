import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';

const contextName = process.argv[2]?.trim().toLowerCase();

if (!contextName) {
  console.error('Usage: pnpm new:context <name>');
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(contextName)) {
  console.error(
    'Context name must start with a letter and contain only lowercase alphanumeric characters and hyphens.',
  );
  process.exit(1);
}

const targetDir = resolve('packages', contextName);

if (existsSync(targetDir)) {
  console.error(`Target directory packages/${contextName} already exists.`);
  process.exit(1);
}

const packageJson = {
  name: `@corebiz/${contextName}`,
  version: '0.1.0',
  private: true,
  type: 'module',
  exports: {
    '.': './src/index.ts',
    './domain': './src/domain/index.ts',
    './application': './src/application/index.ts',
    './infrastructure': './src/infrastructure/index.ts',
  },
  scripts: {
    typecheck: 'tsc --noEmit',
    test: 'vitest run',
  },
  dependencies: {
    '@corebiz/shared-kernel': 'workspace:*',
  },
  devDependencies: {
    typescript: '^5.9.3',
    vitest: '^4.1.11',
  },
};

const tsConfig = {
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    rootDir: '.',
    types: ['vitest/globals'],
  },
  include: ['src/**/*.ts', 'tests/**/*.ts'],
};

const domainIndex = `export * from '@corebiz/shared-kernel';\n`;

const mainIndex = `export * from './domain/index';
export * from './application/index';
export * from './infrastructure/index';
`;

const sampleTest = `import { describe, it, expect } from 'vitest';

describe('${contextName} smoke test', () => {
  it('initializes context successfully', () => {
    expect(true).toBe(true);
  });
});
`;

mkdirSync(join(targetDir, 'src', 'domain'), { recursive: true });
mkdirSync(join(targetDir, 'src', 'application'), { recursive: true });
mkdirSync(join(targetDir, 'src', 'infrastructure'), { recursive: true });
mkdirSync(join(targetDir, 'tests'), { recursive: true });

writeFileSync(join(targetDir, 'package.json'), JSON.stringify(packageJson, null, 2) + '\n', 'utf8');
writeFileSync(join(targetDir, 'tsconfig.json'), JSON.stringify(tsConfig, null, 2) + '\n', 'utf8');
writeFileSync(join(targetDir, 'src', 'domain', 'index.ts'), domainIndex, 'utf8');
writeFileSync(join(targetDir, 'src', 'application', 'index.ts'), 'export {};\n', 'utf8');
writeFileSync(join(targetDir, 'src', 'infrastructure', 'index.ts'), 'export {};\n', 'utf8');
writeFileSync(join(targetDir, 'src', 'index.ts'), mainIndex, 'utf8');
writeFileSync(join(targetDir, 'tests', `${contextName}.test.ts`), sampleTest, 'utf8');

console.log(`Context @corebiz/${contextName} successfully created at packages/${contextName}`);
