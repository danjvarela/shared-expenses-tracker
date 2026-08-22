import type { ReceiptScanLineItem, ScanResult } from '$lib/server/app/interfaces/receipt-scanner';

export const RESPONSE_FORMAT = {
	type: 'object',
	properties: {
		merchant: { type: 'string' },
		date: { type: 'string' },
		total: { type: 'string' },
		lineItems: {
			type: 'array',
			items: {
				type: 'object',
				properties: {
					description: { type: 'string' },
					amount: { type: 'string' }
				},
				required: ['description', 'amount']
			}
		}
	},
	required: ['lineItems']
} as const;

// Describes the document types, not the input modality, so the same rules apply
// whether the model reads an image or OCR-extracted text.
export const STRUCTURING_RULES = `Rules:
- Amounts are raw decimal strings exactly as printed. Never invent cents, never convert currency, never round, never strip a leading minus sign.
- For a receipt or invoice, include only purchased line items. Exclude subtotals, tax, discounts, totals, and payment lines.
- For a bank or credit-card statement screenshot, treat each posted transaction as a line item. Exclude the header row, column labels, running balances, statement totals, opening/closing balance, and any non-transaction rows.
- If a field is absent on the document, return an empty string for it.`;

export function extractJson(content: string): string {
	const fenced = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
	const candidate = fenced ? fenced[1] : content;
	const start = candidate.indexOf('{');
	const end = candidate.lastIndexOf('}');
	if (start !== -1 && end !== -1 && end > start) {
		return candidate.slice(start, end + 1);
	}
	return candidate.trim();
}

export function normalize(raw: unknown): ScanResult {
	const obj = (raw ?? {}) as Record<string, unknown>;
	const lineItems: ReceiptScanLineItem[] = Array.isArray(obj.lineItems)
		? obj.lineItems
				.map((item) => {
					const entry = (item ?? {}) as Record<string, unknown>;
					return {
						description: String(entry.description ?? '').trim(),
						amountDecimal: String(entry.amount ?? '').trim()
					};
				})
				.filter((item) => item.description && item.amountDecimal)
		: [];

	const result: ScanResult = { lineItems };
	const merchant = String(obj.merchant ?? '').trim();
	const date = String(obj.date ?? '').trim();
	const total = String(obj.total ?? '').trim();
	if (merchant) result.merchant = merchant;
	if (date) result.date = date;
	if (total) result.totalDecimal = total;
	return result;
}
