import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import { eq } from 'drizzle-orm';
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
import { recomputeGroupBalances } from '$lib/server/app/pair-balance';
import { sniffMime, PDF_MIME } from '$lib/server/app/receipt-format';
import { formatAmountCents } from '$lib/currency';

const REPLACE_FLAG = '--replace';
const TSV_PATH = resolvePath(process.cwd(), 'all-shared-expenses.tsv');
const FAILED_RECEIPTS_PATH = resolvePath(process.cwd(), 'receipts-failed.txt');

const DAN_EMAIL = 'vareladanmarj@gmail.com';
const NELIE_EMAIL = 'neliejoycabanillas26@gmail.com';

const CATEGORIES: Array<{ name: string; icon: string }> = [
	{ name: 'Household', icon: '🧹' },
	{ name: 'Food', icon: '🍔' },
	{ name: 'Rent', icon: '🏠' },
	{ name: 'Utilities', icon: '💡' },
	{ name: 'Vanities', icon: '💅' },
	{ name: 'Online Food Orders', icon: '🛵' },
	{ name: 'Transportation', icon: '🚗' },
	{ name: 'Subscriptions', icon: '📺' },
	{ name: 'Eating Out', icon: '🍽️' },
	{ name: 'Toiletries/Hygiene', icon: '🧼' },
	{ name: 'Fun', icon: '🎉' }
];

const NELIE_PERCENT = 34;
const DAN_PERCENT = 66;

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

interface TsvRow {
	paidBy: string;
	description: string;
	date: Date;
	amountCents: number;
	category: string;
	proofUrl: string;
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

function parseDate(raw: string): Date {
	const match = raw.match(/^(\w+)\s+(\d+),\s+(\d+)$/);
	if (!match) throw new Error(`unparseable date: ${raw}`);
	const monthIndex = MONTHS[match[1]];
	if (monthIndex === undefined) throw new Error(`unknown month: ${match[1]}`);
	return new Date(Date.UTC(Number(match[3]), monthIndex, Number(match[2])));
}

function parseAmount(raw: string): number {
	const cleaned = raw.replace(/[^\d.]/g, '');
	return Math.round(parseFloat(cleaned) * 100);
}

function parseTsv(content: string): TsvRow[] {
	const lines = content.split(/\r?\n/).filter((line) => line.length > 0);
	const rows: TsvRow[] = [];
	for (const line of lines.slice(1)) {
		const fields = line.split('\t');
		if (fields.length < 6) continue;
		const [paidBy, description, dateRaw, amountRaw, category, proofUrl] = fields;
		rows.push({
			paidBy: paidBy.trim(),
			description: description.trim(),
			date: parseDate(dateRaw.trim()),
			amountCents: parseAmount(amountRaw.trim()),
			category: category.trim(),
			proofUrl: proofUrl.trim()
		});
	}
	return rows;
}

async function main() {
	const replace = process.argv.includes(REPLACE_FLAG);

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

	const existing = await db
		.select({ id: schema.group.id })
		.from(schema.group)
		.where(eq(schema.group.name, 'Apartment'));
	if (existing.length > 0) {
		if (!replace) {
			console.error(
				'Refusing to run: a group named "Apartment" already exists. Pass --replace to cascade-delete it first.'
			);
			process.exit(1);
		}
		for (const g of existing) {
			await db.delete(schema.group).where(eq(schema.group.id, g.id));
		}
		console.log(`--replace: deleted ${existing.length} existing Apartment group(s).`);
	}

	async function ensureUser(email: string, displayName: string) {
		const found = await userRepo.findByEmail(email);
		if (found) return found;
		return userRepo.create({ email, displayName, fromInvite: false });
	}

	const dan = await ensureUser(DAN_EMAIL, 'Dan');
	const nelie = await ensureUser(NELIE_EMAIL, 'Nelie');
	const payerById = new Map<string, string>([
		['Dan', dan.id],
		['Nelie', nelie.id]
	]);

	const [apartment] = await db
		.insert(schema.group)
		.values({ name: 'Apartment', currencyCode: 'PHP' })
		.returning();
	const groupId = apartment.id;

	await db.insert(schema.groupMember).values([
		{ groupId, userId: nelie.id, defaultSplitPercent: NELIE_PERCENT },
		{ groupId, userId: dan.id, defaultSplitPercent: DAN_PERCENT }
	]);

	const createdCategories = await db
		.insert(schema.category)
		.values(CATEGORIES.map((c) => ({ name: c.name, icon: c.icon, ownerGroupId: groupId })))
		.returning();
	await db
		.insert(schema.groupCategory)
		.values(createdCategories.map((c) => ({ groupId, categoryId: c.id })));
	const categoryIdByName = new Map(createdCategories.map((c) => [c.name, c.id]));

	const tsv = await readFile(TSV_PATH, 'utf8');
	const rows = parseTsv(tsv);
	console.log(`Parsed ${rows.length} TSV rows.`);

	const bundles = new Map<string, TsvRow[]>();
	rows.forEach((row, index) => {
		const key = row.proofUrl ? `${row.proofUrl}\t${row.date.getTime()}` : `__row__${index}`;
		const bucket = bundles.get(key);
		if (bucket) bucket.push(row);
		else bundles.set(key, [row]);
	});

	writeFileSync(FAILED_RECEIPTS_PATH, '');
	const urlCache = new Map<string, Uint8Array>();

	const allExpenses: Array<{
		paidByUserId: string;
		splits: Array<{ userId: string; amountCents: number }>;
	}> = [];
	let receiptOk = 0;
	let receiptFailed = 0;

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

	for (const bundleRows of bundles.values()) {
		const firstRow = bundleRows[0];
		const [expenseGroupRow] = await db.insert(schema.expenseGroup).values({ groupId }).returning();

		const expenseIds: string[] = [];
		for (const row of bundleRows) {
			const paidByUserId = payerById.get(row.paidBy);
			if (!paidByUserId) {
				console.warn(`Unknown payer "${row.paidBy}" for "${row.description}" — skipping.`);
				continue;
			}
			const categoryId = categoryIdByName.get(row.category) ?? null;
			if (!categoryId) {
				console.warn(
					`Unknown category "${row.category}" for "${row.description}" — leaving uncategorized.`
				);
			}
			const splits = resolveSplits({
				method: 'percentage',
				amountCents: row.amountCents,
				payerId: paidByUserId,
				members: [
					{ userId: nelie.id, included: true, percent: NELIE_PERCENT },
					{ userId: dan.id, included: true, percent: DAN_PERCENT }
				]
			});
			const [expenseRow] = await db
				.insert(schema.expense)
				.values({
					groupId,
					expenseGroupId: expenseGroupRow.id,
					paidByUserId,
					categoryId,
					description: row.description,
					amountCents: row.amountCents,
					date: row.date
				})
				.returning();
			expenseIds.push(expenseRow.id);
			await db.insert(schema.expenseSplit).values(
				splits.map((s) => ({
					expenseId: expenseRow.id,
					userId: s.userId,
					amountCents: s.amountCents
				}))
			);
			allExpenses.push({ paidByUserId, splits });
		}

		if (firstRow.proofUrl && expenseIds.length > 0) {
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
			const payers = new Set(bundleRows.map((r) => r.paidBy));
			if (payers.size > 1) {
				console.warn(
					`Mixed payers for "${firstRow.description}" — using first row's payer as uploader.`
				);
			}
			const uploaderId = payerById.get(firstRow.paidBy);
			if (!uploaderId) {
				failReceipt(ctx, `unknown payer "${firstRow.paidBy}"`);
				continue;
			}
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

	await recomputeGroupBalances(pairBalanceRepo, groupId, allExpenses, []);

	const balances = await pairBalanceRepo.getAllForGroup(groupId);
	console.log('\n--- Import summary ---');
	console.log(`Expenses: ${allExpenses.length}`);
	console.log(`Splits: ${allExpenses.reduce((sum, e) => sum + e.splits.length, 0)}`);
	console.log(`Receipts ok: ${receiptOk}`);
	console.log(`Receipts failed: ${receiptFailed} (see ${FAILED_RECEIPTS_PATH})`);
	for (const b of balances) {
		const fromName = b.fromUserId === dan.id ? 'Dan' : 'Nelie';
		const toName = b.toUserId === dan.id ? 'Dan' : 'Nelie';
		console.log(`Balance: ${fromName} owes ${toName} ${formatAmountCents(b.amountCents, 'PHP')}`);
	}
	if (balances.length === 0) console.log('Balance: Dan and Nelie are settled up.');

	client.close();
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
