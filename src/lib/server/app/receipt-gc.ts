import type { IExpenseReceiptRepository } from '$lib/server/app/interfaces/repositories/expense-receipt';
import type { IReceiptStorageBackend } from '$lib/server/app/interfaces/receipt-storage';

export const RECEIPT_GC_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

export interface ReceiptGcDeps {
	receiptRepo: IExpenseReceiptRepository;
	storageBackend: IReceiptStorageBackend;
	now?: () => Date;
}

export interface ReceiptGcOptions {
	dryRun: boolean;
}

export interface ReceiptGcResult {
	dryRun: boolean;
	totalKeys: number;
	orphanCount: number;
	orphanKeys: string[];
	deletedKeys: string[];
}

export function createReceiptGcService(deps: ReceiptGcDeps) {
	const now = deps.now ?? (() => new Date());

	async function reconcileOrphanedReceipts(options: ReceiptGcOptions): Promise<ReceiptGcResult> {
		const dryRun = options.dryRun;

		const [storageKeys, dbKeys] = await Promise.all([
			deps.storageBackend.listKeys(),
			deps.receiptRepo.getAllStorageKeys()
		]);

		const referenced = new Set(dbKeys);
		const cutoff = now().getTime() - RECEIPT_GC_GRACE_PERIOD_MS;

		const orphanKeys = storageKeys
			.filter((entry) => !referenced.has(entry.key))
			.filter((entry) => entry.createdAt.getTime() < cutoff)
			.map((entry) => entry.key);

		const deletedKeys: string[] = [];
		if (!dryRun) {
			for (const key of orphanKeys) {
				try {
					await deps.storageBackend.delete(key);
					deletedKeys.push(key);
				} catch (err) {
					console.error('Failed to delete orphaned receipt bytes', { key, err });
				}
			}
		}

		return {
			dryRun,
			totalKeys: storageKeys.length,
			orphanCount: orphanKeys.length,
			orphanKeys,
			deletedKeys
		};
	}

	return { reconcileOrphanedReceipts };
}

export type ReceiptGcService = ReturnType<typeof createReceiptGcService>;
