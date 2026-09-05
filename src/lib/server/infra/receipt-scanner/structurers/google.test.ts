import { describe, it, expect, vi } from 'vitest';
import type { GoogleGenAI } from '@google/genai';
import { createGoogleReceiptStructurer } from './google';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';
import { createRecordingLogger } from '$lib/server/infra/logger/testing';

const PARSED_TEXT = 'FRESH MART\n2026-08-21\nMilk 3.49\nBread 2.10\nTotal 5.59';

const STRUCTURED = {
	merchant: 'Fresh Mart',
	date: '2026-08-21',
	total: '5.59',
	lineItems: [
		{ description: 'Milk', amount: '3.49' },
		{ description: 'Bread', amount: '2.10' }
	]
};

const EXPECTED_RESULT = {
	merchant: 'Fresh Mart',
	date: '2026-08-21',
	totalDecimal: '5.59',
	lineItems: [
		{ description: 'Milk', amountDecimal: '3.49' },
		{ description: 'Bread', amountDecimal: '2.10' }
	]
};

function makeClient(text: string): GoogleGenAI {
	const generateContent = vi.fn().mockResolvedValue({ text });
	return { models: { generateContent } } as unknown as GoogleGenAI;
}

describe('createGoogleReceiptStructurer', () => {
	it('calls generateContent with the gemini model, prompt + parsedText, and JSON structured-output config', async () => {
		const client = makeClient(JSON.stringify(STRUCTURED));
		const structurer = createGoogleReceiptStructurer({ client, model: 'gemini-2.0-flash' });

		await structurer.structure(PARSED_TEXT);

		const [arg] = (client.models.generateContent as ReturnType<typeof vi.fn>).mock.calls[0];
		expect(arg.model).toBe('gemini-2.0-flash');
		expect(arg.contents).toContain('OCR-extracted text');
		expect(arg.contents).toContain(PARSED_TEXT);
		expect(arg.config.responseMimeType).toBe('application/json');
		expect(arg.config.responseSchema.type).toBe('OBJECT');
		expect(arg.config.responseSchema.required).toEqual(['lineItems']);
	});

	it('normalizes the Gemini JSON into a ScanResult', async () => {
		const client = makeClient(JSON.stringify(STRUCTURED));
		const structurer = createGoogleReceiptStructurer({ client, model: 'gemini-2.0-flash' });

		const result = await structurer.structure(PARSED_TEXT);

		expect(result).toEqual(EXPECTED_RESULT);
	});

	it('throws ReceiptScannerError when generateContent rejects, logging no receipt contents', async () => {
		const logger = createRecordingLogger();
		const generateContent = vi.fn().mockRejectedValue(new Error('upstream down'));
		const client = { models: { generateContent } } as unknown as GoogleGenAI;
		const structurer = createGoogleReceiptStructurer({ client, model: 'gemini-2.0-flash', logger });

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(ReceiptScannerError);

		for (const entry of logger.entries) {
			const serialized = JSON.stringify(entry.fields);
			expect(serialized).not.toContain(PARSED_TEXT);
			expect(serialized).not.toContain('Milk');
			expect(serialized).not.toContain('Fresh Mart');
		}
	});

	it('throws ReceiptScannerError when the response has no text', async () => {
		const generateContent = vi.fn().mockResolvedValue({ text: '' });
		const client = { models: { generateContent } } as unknown as GoogleGenAI;
		const structurer = createGoogleReceiptStructurer({ client, model: 'gemini-2.0-flash' });

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(ReceiptScannerError);
	});

	it('throws ReceiptScannerError when the response is malformed JSON', async () => {
		const client = makeClient('not json');
		const structurer = createGoogleReceiptStructurer({ client, model: 'gemini-2.0-flash' });

		await expect(structurer.structure(PARSED_TEXT)).rejects.toBeInstanceOf(ReceiptScannerError);
	});

	it('logs google structuring request/response with durationMs and no receipt contents', async () => {
		const logger = createRecordingLogger();
		const structurer = createGoogleReceiptStructurer({
			client: makeClient(JSON.stringify(STRUCTURED)),
			model: 'gemini-2.0-flash',
			logger
		});

		await structurer.structure(PARSED_TEXT);

		const infos = logger.entries.filter((e) => e.level === 'info');
		expect(infos.map((e) => e.message)).toEqual([
			'google structuring request',
			'google structuring response'
		]);
		const request = infos.find((e) => e.message === 'google structuring request');
		const response = infos.find((e) => e.message === 'google structuring response');
		expect(request?.fields.model).toBe('gemini-2.0-flash');
		expect(response?.fields.durationMs).toBeTypeOf('number');
		for (const entry of logger.entries) {
			const serialized = JSON.stringify(entry.fields);
			expect(serialized).not.toContain(PARSED_TEXT);
			expect(serialized).not.toContain('Milk');
			expect(serialized).not.toContain('Fresh Mart');
		}
	});
});
