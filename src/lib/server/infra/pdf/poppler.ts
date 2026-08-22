import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFile, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ReceiptRasterizeError, type IPdfProcessor, type PdfFirstPage } from './index';

const CORRUPT_MESSAGE =
	"Couldn't read this PDF — it may be corrupt or password-protected. Try an image instead.";

export type SpawnFn = typeof spawn;

export interface CreatePopplerProcessorOptions {
	spawn?: SpawnFn;
	dpi?: number;
}

async function streamToBuffer(stream: ReadableStream<Uint8Array>): Promise<Buffer> {
	const reader = stream.getReader();
	const chunks: Buffer[] = [];
	while (true) {
		const { done, value } = await reader.read();
		if (done) break;
		chunks.push(Buffer.from(value));
	}
	return Buffer.concat(chunks);
}

export function createPopplerPdfProcessor(opts: CreatePopplerProcessorOptions = {}): IPdfProcessor {
	const spawnFn = opts.spawn ?? spawn;
	const dpi = opts.dpi ?? 150;

	function runPdfInfo(bytes: Buffer): Promise<number> {
		return new Promise((resolve, reject) => {
			const proc = spawnFn('pdfinfo', ['-'], { stdio: ['pipe', 'pipe', 'pipe'] });
			let stdout = '';
			proc.stdout.on('data', (chunk: Buffer) => {
				stdout += chunk.toString();
			});
			proc.stderr.on('data', () => {});
			proc.on('error', () => reject(new ReceiptRasterizeError(CORRUPT_MESSAGE)));
			proc.on('close', (code) => {
				if (code !== 0) {
					reject(new ReceiptRasterizeError(CORRUPT_MESSAGE));
					return;
				}
				const match = stdout.match(/^Pages:\s+(\d+)/m);
				if (!match) {
					reject(new ReceiptRasterizeError(CORRUPT_MESSAGE));
					return;
				}
				resolve(Number(match[1]));
			});
			proc.stdin.end(bytes);
		});
	}

	function runPdftoppm(bytes: Buffer): Promise<Buffer> {
		return new Promise((resolve, reject) => {
			const prefix = join(tmpdir(), `receipt-${randomUUID()}`);
			const outFile = `${prefix}.png`;
			const proc = spawnFn(
				'pdftoppm',
				['-png', '-r', String(dpi), '-singlefile', '-f', '1', '-l', '1', '-', prefix],
				{ stdio: ['pipe', 'pipe', 'pipe'] }
			);
			proc.stderr.on('data', () => {});
			proc.on('error', async () => {
				await unlink(outFile).catch(() => {});
				reject(new ReceiptRasterizeError(CORRUPT_MESSAGE));
			});
			proc.on('close', async (code) => {
				if (code !== 0) {
					await unlink(outFile).catch(() => {});
					reject(new ReceiptRasterizeError(CORRUPT_MESSAGE));
					return;
				}
				try {
					const image = await readFile(outFile);
					await unlink(outFile).catch(() => {});
					resolve(image);
				} catch {
					reject(new ReceiptRasterizeError(CORRUPT_MESSAGE));
				}
			});
			proc.stdin.end(bytes);
		});
	}

	async function countPages(stream: ReadableStream<Uint8Array>): Promise<number> {
		const bytes = await streamToBuffer(stream);
		return runPdfInfo(bytes);
	}

	async function rasterizeFirstPage(stream: ReadableStream<Uint8Array>): Promise<PdfFirstPage> {
		const bytes = await streamToBuffer(stream);
		const pageCount = await runPdfInfo(bytes);
		const image = await runPdftoppm(bytes);
		return { image, pageCount };
	}

	return { countPages, rasterizeFirstPage };
}
