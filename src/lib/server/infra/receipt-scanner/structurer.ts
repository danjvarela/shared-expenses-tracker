import type { ScanResult } from '$lib/server/app/interfaces/receipt-scanner';

export interface IReceiptStructurer {
	structure(parsedText: string): Promise<ScanResult>;
}
