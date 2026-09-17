import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const forbidden = ['$lib', '$app', '$env'];

function collectImports(file: string, seen = new Set<string>()): string[] {
	if (seen.has(file)) return [];
	seen.add(file);

	const source = readFileSync(file, 'utf-8');
	for (const alias of forbidden) {
		if (source.includes(`from '${alias}`) || source.includes(`from "${alias}`)) {
			throw new Error(`${file} imports from ${alias}`);
		}
	}

	const importPaths = [...source.matchAll(/from ['"](\.[^'"]+)['"]/g)].map((match) => match[1]);
	const files = [];
	for (const importPath of importPaths) {
		const resolved = resolve(dirname(file), importPath);
		const candidate = ['.ts', '.js', '/index.ts', '/index.js'].map((ext) =>
			importPath.endsWith(ext.replace(/^\//, '')) ? resolved : resolved + ext
		);
		const found = candidate.find((path) => {
			try {
				readFileSync(path, 'utf-8');
				return true;
			} catch {
				return false;
			}
		});
		if (found) files.push(found, ...collectImports(found, seen));
	}
	return files;
}

describe('seed scripts stay standalone', () => {
	test.each(['seed.ts', 'seed-demo.ts'])('%s has no $lib/$app/$env in its import graph', (entry) => {
		expect(() => collectImports(join(scriptsDir, entry))).not.toThrow();
	});
});
