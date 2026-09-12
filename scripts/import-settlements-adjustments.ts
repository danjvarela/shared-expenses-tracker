import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { and, count, eq } from 'drizzle-orm';
import { spawn as nativeSpawn, type SpawnOptions } from 'node:child_process';
import { appendFileSync, writeFileSync } from 'node:fs';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
import * as schema from '../src/lib/server/infra/db/schema';
import {
	createFileSystemReceiptStorageBackend,
	resolveFsDir
} from '$lib/server/infra/receipt-storage/fs';
import { createPopplerPdfProcessor } from '$lib/server/infra/pdf';
import { createReceiptNormalizer } from '$lib/server/infra/receipt-normalizer';
import { createExpenseRepository } from '$lib/server/infra/db/repositories/expense';
import { createExpenseGroupRepository } from '$lib/server/infra/db/repositories/expense-group';
import { createGroupMemberRepository } from '$lib/server/infra/db/repositories/group-member';
import { createExpenseReceiptRepository } from '$lib/server/infra/db/repositories/expense-receipt';
import { createPairBalanceRepository } from '$lib/server/infra/db/repositories/pair-balance';
import { createUserRepository } from '$lib/server/infra/db/repositories/user';
import { createReceiptService } from '$lib/server/app/receipt';
import { resolveSplits } from '$lib/server/app/split-resolver';
import { applyPairBalanceDeltas, expenseDeltas, settlementDelta } from '$lib/server/app/pair-balance';
import { sniffMime, PDF_MIME } from '$lib/server/app/receipt-format';
import { formatAmountCents } from '$lib/currency';

const ADJUSTMENTS_TSV_PATH = resolvePath(process.cwd(), 'adjustments.tsv');
const SETTLEMENTS_TSV_PATH = resolvePath(process.cwd(), 'settlements.tsv');
const FAILED_RECEIPTS_PATH = resolvePath(process.cwd(), 'receipts-failed.txt');

const DAN_EMAIL = 'vareladanmarj@gmail.com';
const NELIE_EMAIL = 'neliejoycabanillas26@gmail.com';

const ADJUSTMENTS_CATEGORY = { name: 'Adjustments', icon: '🔧' };

const MONTHS: Record<string, number> = {
	January: 0,
	February: 1,
	March: 2,
	April: 3,
	May: 4,
	June: 5,
	July: 6,
	August: 7,
	September: 8,
	October: 9,
	November: 10,
	December: 11
};

interface AdjustmentRow {
	forName: string;
	description: string;
	date: Date;
	amountCents: number;
	proofUrl: string;
}

interface SettlementRow {
	date: Date;
	fromName: string;
	toName: string;
	amountCents: number;
}

function bufferToStream(buf: Uint8Array): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(buf);
			controller.close();
		}
	});
}

function safeSpawn(command: string, args: string[], options: SpawnOptions) {
	const proc = nativeSpawn(command, args, options);
	proc.stdin.on('error', () => {});
	return proc;
}

function runGsPage(inPath: string, page: number): Promise<Buffer> {
	const cmd = `gs -q -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dFirstPage=${page} -dLastPage=${page} -sOutputFile=- - < "${inPath}"`;
	return new Promise((resolve, reject) => {
		const proc = nativeSpawn(cmd, { shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
		const out: Buffer[] = [];
		let stderr = '';
		proc.stdout.on('data', (chunk: Buffer) => out.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => {
			stderr += chunk.toString();
		});
		proc.on('error', reject);
		proc.on('close', (code) => {
			if (code !== 0) {
				reject(new Error(`gs exited ${code}${stderr ? `: ${stderr.trim()}` : ''}`));
				return;
			}
			resolve(Buffer.concat(out));
		});
	});
}

async function splitPdfPages(bytes: Buffer, pageCount: number): Promise<Buffer[]> {
	const dir = await mkdtemp(join(tmpdir(), 'gs-split-'));
	const inPath = join(dir, 'in.pdf');
	await writeFile(inPath, bytes);
	try {
		const pages: Buffer[] = [];
		for (let page = 1; page <= pageCount; page++) {
			pages.push(await runGsPage(inPath, page));
		}
		return pages;
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}

function extractFileId(url: string): string | null {
	const match = url.match(/file\/d\/([^/]+)\//);
	return match ? match[1] : null;
}

async function downloadReceipt(fileId: string): Promise<Uint8Array> {
	const url = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
	const res = await fetch(url);
	if (!res.ok) throw new Error(`download failed: ${res.status}`);
	return new Uint8Array(await res.arrayBuffer());
}

function parseAmount(raw: string): number {
	const cleaned = raw.replace(/[^\d.]/g, '');
	return Math.round(parseFloat(cleaned) * 100);
}

function parseNamedDate(raw: string): Date {
	const match = raw.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
	if (!match) throw new Error(`unparseable date: ${raw}`);
	const monthIndex = MONTHS[match[1]];
	if (monthIndex === undefined) throw new Error(`unknown month: ${match[1]}`);
	return new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[2])));
}

function parseNumericDate(raw: string): Date {
	const match = raw.match(/^(\d+)\/(\d+)\/(\d+)$/);
	if (!match) throw new Error(`unparseable settlement date: ${raw}`);
	return new Date(Date.UTC(Number(match[3]), Number(match[1]) - 1, Number(match[2])));
}

function parseAdjustmentsTsv(content: string): AdjustmentRow[] {
	const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
	const rows: AdjustmentRow[] = [];
	for (const line of lines.slice(1)) {
		const fields = line.split('\t');
		if (fields.length < 4) continue;
		const [dateRaw, amountRaw, forName, description, proofUrl] = fields;
		rows.push({
			forName: forName.trim(),
			description: description.trim(),
			date: parseNamedDate(dateRaw.trim()),
			amountCents: parseAmount(amountRaw.trim()),
			proofUrl: (proofUrl ?? '').trim()
		});
	}
	return rows;
}

function parseSettlementsTsv(content: string): SettlementRow[] {
	const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
	const rows: SettlementRow[] = [];
	for (const line of lines.slice(1)) {
		const fields = line.split('\t');
		if (fields.length < 4) continue;
		const [dateRaw, fromName, toName, amountRaw] = fields;
		rows.push({
			date: parseNumericDate(dateRaw.trim()),
			fromName: fromName.trim(),
			toName: toName.trim(),
			amountCents: parseAmount(amountRaw.trim())
		});
	}
	return rows;
}

async function main() {
	const databaseUrl = process.env.DATABASE_URL;
	if (!databaseUrl) throw new Error('DATABASE_URL is not set');

	const client = createClient({ url: databaseUrl });
	const db = drizzle(client, { schema, casing: 'snake_case' });

	const userRepo = createUserRepository(db);
	const expenseRepo = createExpenseRepository(db);
	const expenseGroupRepo = createExpenseGroupRepository(db);
	const groupMemberRepo = createGroupMemberRepository(db);
	const receiptRepo = createExpenseReceiptRepository(db);
	const pairBalanceRepo = createPairBalanceRepository(db);

	const storageDir = resolveFsDir(process.env.RECEIPT_STORAGE_FS_DIR ?? './uploads');
	const storageBackend = createFileSystemReceiptStorageBackend(storageDir);
	const pdfProcessor = createPopplerPdfProcessor({ spawn: safeSpawn });
	const normalizer = createReceiptNormalizer({ pdfProcessor, spawn: safeSpawn });
	const receiptService = createReceiptService({
		receiptRepo,
		storageBackend,
		normalizer,
		expenseRepo,
		expenseGroupRepo,
		groupMemberRepo
	});

	const [apartment] = await db
		.select({ id: schema.group.id })
		.from(schema.group)
		.where(eq(schema.group.name, 'Apartment'));
	if (!apartment) {
		console.error(
			'Refusing to run: no group named "Apartment" exists. Run import-shared-expenses.ts first.'
		);
		process.exit(1);
	}
	const groupId = apartment.id;

	async function ensureUser(email: string, displayName: string) {
		const found = await userRepo.findByEmail(email);
		if (found) return found;
		return userRepo.create({ email, displayName, fromInvite: false });
	}

	const dan = await ensureUser(DAN_EMAIL, 'Dan');
	const nelie = await ensureUser(NELIE_EMAIL, 'Nelie');
	const userIdByName = new Map<string, string>([
		['Dan', dan.id],
		['Nelie', nelie.id]
	]);
	const nameByUserId = new Map<string, string>([
		[dan.id, 'Dan'],
		[nelie.id, 'Nelie']
	]);

	for (const userId of [dan.id, nelie.id]) {
		const isMember = await groupMemberRepo.isMember(groupId, userId);
		if (!isMember) await groupMemberRepo.create(groupId, userId);
	}

	const [existingCategory] = await db
		.select({ id: schema.category.id })
		.from(schema.category)
		.where(and(eq(schema.category.name, ADJUSTMENTS_CATEGORY.name), eq(schema.category.ownerGroupId, groupId)));
	let adjustmentsCategoryId: string;
	if (existingCategory) {
		const [expenseCount] = await db
			.select({ total: count() })
			.from(schema.expense)
			.where(
				and(eq(schema.expense.groupId, groupId), eq(schema.expense.categoryId, existingCategory.id))
			);
		if ((expenseCount?.total ?? 0) > 0) {
			console.error(
				'Refusing to run: adjustment expenses already imported (Adjustments category has expenses). This script is one-shot.'
			);
			process.exit(1);
		}
		adjustmentsCategoryId = existingCategory.id;
	} else {
		const [created] = await db
			.insert(schema.category)
			.values({
				name: ADJUSTMENTS_CATEGORY.name,
				icon: ADJUSTMENTS_CATEGORY.icon,
				ownerGroupId: groupId
			})
			.returning();
		adjustmentsCategoryId = created.id;
		await db
			.insert(schema.groupCategory)
			.values({ groupId, categoryId: adjustmentsCategoryId });
	}

	const adjustmentsTsv = await readFile(ADJUSTMENTS_TSV_PATH, 'utf8');
	const adjustmentRows = parseAdjustmentsTsv(adjustmentsTsv);
	console.log(`Parsed ${adjustmentRows.length} adjustment rows.`);

	const bundles = new Map<string, AdjustmentRow[]>();
	adjustmentRows.forEach((row, index) => {
		const key = row.proofUrl ? `${row.proofUrl}\t${row.date.getTime()}` : `__row__${index}`;
		const bucket = bundles.get(key);
		if (bucket) bucket.push(row);
		else bundles.set(key, [row]);
	});
	const bundleOrder = Array.from(bundles.keys());

	writeFileSync(FAILED_RECEIPTS_PATH, '');
	const urlCache = new Map<string, Uint8Array>();

	let receiptOk = 0;
	let receiptFailed = 0;
	let importedExpenses = 0;

	interface ReceiptFailureContext {
		url: string;
		description: string;
		date: Date;
	}

	function failReceipt(ctx: ReceiptFailureContext, reason: unknown) {
		receiptFailed++;
		appendFileSync(
			FAILED_RECEIPTS_PATH,
			`${ctx.url}\t${ctx.description}\t${ctx.date.toISOString()}\n`
		);
		console.warn(`Receipt failed (${ctx.url}): ${String(reason)}`);
	}

	async function attachReceipt(
		expenseId: string,
		uploaderId: string,
		buffer: Uint8Array,
		mime: string,
		ctx: ReceiptFailureContext
	) {
		try {
			await receiptService.createReceipt(uploaderId, {
				expenseId,
				bytes: buffer,
				mime,
				sizeBytes: buffer.length
			});
			receiptOk++;
		} catch (err) {
			failReceipt(ctx, err);
		}
	}

	for (const key of bundleOrder) {
		const bundleRows = bundles.get(key)!;
		const firstRow = bundleRows[0];
		const [expenseGroupRow] = await db.insert(schema.expenseGroup).values({ groupId }).returning();

		const expenseIds: string[] = [];
		let bundleUploaderId: string | null = null;
		for (const row of bundleRows) {
			const forUserId = userIdByName.get(row.forName);
			if (!forUserId) {
				console.warn(`Unknown "For" person "${row.forName}" for "${row.description}" — skipping.`);
				continue;
			}
			const paidByUserId = forUserId === dan.id ? nelie.id : dan.id;
			const splits = resolveSplits({
				method: 'percentage',
				amountCents: row.amountCents,
				payerId: paidByUserId,
				members: [
					{ userId: forUserId, included: true, percent: 100 },
					{ userId: paidByUserId, included: false }
				]
			});
			const [expenseRow] = await db
				.insert(schema.expense)
				.values({
					groupId,
					expenseGroupId: expenseGroupRow.id,
					paidByUserId,
					categoryId: adjustmentsCategoryId,
					description: row.description,
					amountCents: row.amountCents,
					date: row.date
				})
				.returning();
			expenseIds.push(expenseRow.id);
			if (bundleUploaderId === null) bundleUploaderId = paidByUserId;
			await db.insert(schema.expenseSplit).values(
				splits.map((s) => ({
					expenseId: expenseRow.id,
					userId: s.userId,
					amountCents: s.amountCents
				}))
			);
			await applyPairBalanceDeltas(
				pairBalanceRepo,
				groupId,
				expenseDeltas(paidByUserId, splits)
			);
			importedExpenses++;
		}

		if (firstRow.proofUrl && bundleUploaderId) {
			const ctx: ReceiptFailureContext = {
				url: firstRow.proofUrl,
				description: firstRow.description,
				date: firstRow.date
			};
			const fileId = extractFileId(ctx.url);
			if (!fileId) {
				failReceipt(ctx, 'unparseable Drive URL');
				continue;
			}
			const uploaderId = bundleUploaderId;
			const firstExpenseId = expenseIds[0];
			try {
				let bytes = urlCache.get(ctx.url);
				if (!bytes) {
					bytes = await downloadReceipt(fileId);
					urlCache.set(ctx.url, bytes);
				}
				const mime = sniffMime(bytes);
				if (!mime) {
					failReceipt(ctx, 'sniff returned null');
					continue;
				}

				if (mime === PDF_MIME) {
					const pageCount = await pdfProcessor.countPages(bufferToStream(bytes));
					if (pageCount < 1) {
						failReceipt(ctx, 'pdf has no pages');
						continue;
					}
					const pageBuffers =
						pageCount === 1
							? [Buffer.from(bytes)]
							: await splitPdfPages(Buffer.from(bytes), pageCount);
					for (const pageBuffer of pageBuffers) {
						await attachReceipt(firstExpenseId, uploaderId, pageBuffer, PDF_MIME, ctx);
					}
				} else {
					await attachReceipt(firstExpenseId, uploaderId, bytes, mime, ctx);
				}
			} catch (err) {
				failReceipt(ctx, err);
			}
		}
	}

	const settlementsTsv = await readFile(SETTLEMENTS_TSV_PATH, 'utf8');
	const settlementRows = parseSettlementsTsv(settlementsTsv);
	console.log(`Parsed ${settlementRows.length} settlement rows.`);

	for (const row of settlementRows) {
		const fromUserId = userIdByName.get(row.fromName);
		const toUserId = userIdByName.get(row.toName);
		if (!fromUserId || !toUserId) {
			console.warn(`Unknown settlement party "${row.fromName}"→"${row.toName}" — skipping.`);
			continue;
		}
		await db.insert(schema.settlement).values({
			groupId,
			fromUserId,
			toUserId,
			amountCents: row.amountCents
		});
		await applyPairBalanceDeltas(pairBalanceRepo, groupId, [
			settlementDelta({ fromUserId, toUserId, amountCents: row.amountCents })
		]);
	}

	const balances = await pairBalanceRepo.getAllForGroup(groupId);
	console.log('\n--- Import summary ---');
	console.log(`Settlements: ${settlementRows.length}`);
	console.log(`Adjustment expenses: ${importedExpenses}`);
	console.log(`Receipts ok: ${receiptOk}`);
	console.log(`Receipts failed: ${receiptFailed} (see ${FAILED_RECEIPTS_PATH})`);
	for (const b of balances) {
		const fromName = nameByUserId.get(b.fromUserId) ?? 'Unknown';
		const toName = nameByUserId.get(b.toUserId) ?? 'Unknown';
		console.log(`Balance: ${fromName} owes ${toName} ${formatAmountCents(b.amountCents, 'PHP')}`);
	}
	if (balances.length === 0) console.log('Balance: Dan and Nelie are settled up.');

	client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});