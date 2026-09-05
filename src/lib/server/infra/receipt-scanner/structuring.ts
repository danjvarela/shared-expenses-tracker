import type { ReceiptScanLineItem, ScanResult } from '$lib/server/app/interfaces/receipt-scanner';

// Document-type rules shared by both structurers; modality-agnostic.
export const STRUCTURING_RULES = `Rules:
- Amounts are raw decimal strings exactly as printed. Never invent cents, never convert currency, never round, never strip a leading minus sign.
- For a receipt or invoice, include only purchased line items. Exclude subtotals, tax, discounts, totals, and payment lines.
- For a bank or credit-card statement screenshot, treat each posted transaction as a line item. Exclude the header row, column labels, running balances, statement totals, opening/closing balance, and any non-transaction rows.
- If a field is absent on the document, return an empty string for it.`;

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
