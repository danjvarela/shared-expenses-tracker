import { describe, it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createOllamaReceiptScanner } from './ollama';
import { resolveScannerConfig } from './index';

const here = dirname(fileURLToPath(import.meta.url));

// End-to-end contract test against a real Ollama vision model. Skipped unless
// RUN_SCANNER_INTEGRATION=1 is set, so the default suite never depends on a
// running Ollama instance. Run it with the fixture and model in place:
//   RUN_SCANNER_INTEGRATION=1 OLLAMA_VISION_MODEL=<model> pnpm exec vitest run src/lib/server/infra/receipt-scanner/integration.test.ts
const FIXTURE_PATH = resolve(here, 'fixtures/receipt.png');
const enabled = process.env.RUN_SCANNER_INTEGRATION === '1';

describe.skipIf(!enabled)('ollama scanner integration', () => {
	it('scans a fixture receipt image into line items', async () => {
		const config = resolveScannerConfig(process.env);
		if (config.backend !== 'ollama') {
			throw new Error('RUN_SCANNER_INTEGRATION=1 requires RECEIPT_SCANNER_BACKEND=ollama');
		}

		const bytes = await readFile(FIXTURE_PATH);
		const scanner = createOllamaReceiptScanner({
			baseUrl: config.baseUrl,
			model: config.model,
			apiKey: config.apiKey
		});

		const result = await scanner.scan(
			new ReadableStream<Uint8Array>({
				start(controller) {
					controller.enqueue(new Uint8Array(bytes));
					controller.close();
				}
			}),
			'image/png'
		);

		expect(Array.isArray(result.lineItems)).toBe(true);
		expect(result.lineItems.length).toBeGreaterThan(0);
		for (const item of result.lineItems) {
			expect(typeof item.description).toBe('string');
			expect(item.description.length).toBeGreaterThan(0);
			expect(typeof item.amountDecimal).toBe('string');
			expect(item.amountDecimal).toMatch(/^\d/);
		}
	}, 120_000);
});