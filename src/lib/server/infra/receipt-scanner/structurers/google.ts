import { GoogleGenAI, Type } from '@google/genai';
import {
	ReceiptScannerError,
	type ScanResult
} from '$lib/server/app/interfaces/receipt-scanner';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';
import { STRUCTURING_RULES, normalize } from '../structuring';
import type { IReceiptStructurer } from '../structurer';

const RESPONSE_SCHEMA = {
	type: Type.OBJECT,
	properties: {
		merchant: { type: Type.STRING },
		date: { type: Type.STRING },
		total: { type: Type.STRING },
		lineItems: {
			type: Type.ARRAY,
			items: {
				type: Type.OBJECT,
				properties: {
					description: { type: Type.STRING },
					amount: { type: Type.STRING }
				},
				required: ['description', 'amount']
			}
		}
	},
	required: ['lineItems']
} as const;

const TEXT_PROMPT = `You are a financial document parser. The input is OCR-extracted text from a receipt, an invoice, or a bank/credit-card statement. Extract structured data from it.
Return JSON with these fields:
- merchant: store, vendor, or financial institution name, or empty string if unknown
- date: the document or statement date exactly as printed, or empty string
- total: grand total exactly as printed on a receipt/invoice, as a raw decimal string (e.g. "42.99"), or empty string for a statement that has no single total
- lineItems: array of line entries, each with:
  - description: the entry description as printed (a purchased item on a receipt, or a posted transaction on a statement)
  - amount: the line amount exactly as printed, as a raw decimal string (e.g. "3.49")

${STRUCTURING_RULES}`;

export interface CreateGoogleStructurerOptions {
	client: GoogleGenAI;
	model: string;
	logger?: ILogger;
}

export function createGoogleReceiptStructurer({
	client,
	model,
	logger = NOOP_LOGGER
}: CreateGoogleStructurerOptions): IReceiptStructurer {
	const log = logger.child({ component: 'structurer.google' });

	return {
		async structure(parsedText): Promise<ScanResult> {
			log.info('google structuring request', { model });
			const t0 = Date.now();
			let text: string;
			try {
				const response = await client.models.generateContent({
					model,
					contents: `${TEXT_PROMPT}\n\n${parsedText}`,
					config: {
						responseMimeType: 'application/json',
						responseSchema: RESPONSE_SCHEMA
					}
				});
				text = response.text ?? '';
			} catch (err) {
				log.error('google structuring request failed', { err });
				throw new ReceiptScannerError(`Scanner request failed: ${String(err)}`);
			}

			log.info('google structuring response', { durationMs: Date.now() - t0 });

			if (!text) {
				log.error('google structuring returned no content');
				throw new ReceiptScannerError('Scanner returned an unexpected response');
			}

			let structured: unknown;
			try {
				structured = JSON.parse(text);
			} catch {
				log.error('google structuring returned non-JSON content');
				throw new ReceiptScannerError('Scanner returned malformed JSON');
			}

			return normalize(structured);
		}
	};
}
