import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { writeFile } from 'node:fs/promises';
import { createPopplerPdfProcessor } from './poppler';
import { ReceiptRasterizeError } from './index';

class FakePipe extends EventEmitter {
	push(chunk: string | Buffer | null) {
		if (chunk === null) this.emit('end');
		else this.emit('data', Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
}

interface FakeProc extends EventEmitter {
	stdin: Writable;
	stdout: FakePipe;
	stderr: FakePipe;
}

function makeProc(): FakeProc {
	const proc = new EventEmitter() as FakeProc;
	proc.stdin = new Writable({
		write(_chunk, _enc, cb) {
			cb();
		}
	});
	proc.stdout = new FakePipe();
	proc.stderr = new FakePipe();
	return proc;
}

function makeStream(buf: Buffer): ReadableStream<Uint8Array> {
	return new ReadableStream<Uint8Array>({
		start(controller) {
			controller.enqueue(new Uint8Array(buf));
			controller.close();
		}
	});
}

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

// pdftoppm writes its PNG to <prefix>.png (prefix = last arg), not stdout.
async function writePngOutput(args: string[], bytes: Buffer) {
	await writeFile(`${args[args.length - 1]}.png`, bytes);
}

describe('createPopplerPdfProcessor.countPages', () => {
	it('returns the page count from pdfinfo', async () => {
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const spawnFn = vi.fn((cmd: string, args: string[]) => {
			const proc = makeProc();
			calls.push({ cmd, args });
			queueMicrotask(() => {
				proc.stdout.push('Producer: poppler\nPages: 2\nPage size: 612 x 792\n');
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		const count = await processor.countPages(makeStream(Buffer.from('%PDF-1.4 body')));

		expect(count).toBe(2);
		expect(calls.map((c) => c.cmd)).toEqual(['pdfinfo']);
	});

	it('rejects with ReceiptRasterizeError when pdfinfo exits non-zero', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('Syntax Error: corrupt\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(processor.countPages(makeStream(Buffer.from('%PDF-1.4')))).rejects.toBeInstanceOf(
			ReceiptRasterizeError
		);
	});

	it('rejects when pdfinfo output has no Pages line', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push('Producer: poppler\n');
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(processor.countPages(makeStream(Buffer.from('%PDF-1.4')))).rejects.toBeInstanceOf(
			ReceiptRasterizeError
		);
	});

	it('rejects when the spawn itself fails (ENOENT)', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => proc.emit('error', new Error('spawn ENOENT')));
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(processor.countPages(makeStream(Buffer.from('%PDF-1.4')))).rejects.toBeInstanceOf(
			ReceiptRasterizeError
		);
	});
});

describe('createPopplerPdfProcessor.rasterizeFirstPage', () => {
	it('returns the page-1 image and page count for a single-page PDF', async () => {
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const spawnFn = vi.fn((cmd: string, args: string[]) => {
			const proc = makeProc();
			calls.push({ cmd, args });
			queueMicrotask(async () => {
				if (cmd === 'pdfinfo') {
					proc.stdout.push('Producer: poppler\nPages: 1\nPage size: 612 x 792\n');
					proc.stdout.push(null);
					proc.emit('close', 0);
				} else {
					await writePngOutput(args, PNG_BYTES);
					proc.emit('close', 0);
				}
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		const result = await processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4 body')));

		expect(result.pageCount).toBe(1);
		expect(result.image.equals(PNG_BYTES)).toBe(true);
		expect(calls.map((c) => c.cmd)).toEqual(['pdfinfo', 'pdftoppm']);
		expect(calls[1].args).toContain('-png');
		expect(calls[1].args).toContain('-r');
		expect(calls[1].args).toContain('150');
		expect(calls[1].args).toContain('-singlefile');
		expect(calls[1].args).toContain('-f');
		expect(calls[1].args).toContain('1');
		expect(calls[1].args).toContain('-l');
		expect(calls[1].args).toContain('1');
	});

	it('reports a multi-page page count without rejecting (policy is enforced upstream)', async () => {
		const spawnFn = vi.fn((cmd: string, args: string[]) => {
			const proc = makeProc();
			queueMicrotask(async () => {
				if (cmd === 'pdfinfo') {
					proc.stdout.push('Pages: 3\n');
					proc.stdout.push(null);
				} else {
					await writePngOutput(args, PNG_BYTES);
				}
				proc.emit('close', 0);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		const result = await processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')));

		expect(result.pageCount).toBe(3);
	});

	it('rejects with ReceiptRasterizeError when pdfinfo exits non-zero', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('Syntax Error: corrupt\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(
			processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')))
		).rejects.toBeInstanceOf(ReceiptRasterizeError);
	});

	it('rejects when pdfinfo output has no Pages line', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push('Producer: poppler\n');
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(
			processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')))
		).rejects.toBeInstanceOf(ReceiptRasterizeError);
	});

	it('rejects when pdftoppm exits non-zero', async () => {
		const spawnFn = vi.fn((cmd: string) => {
			const proc = makeProc();
			queueMicrotask(() => {
				if (cmd === 'pdfinfo') {
					proc.stdout.push('Pages: 1\n');
					proc.emit('close', 0);
				} else {
					proc.emit('close', 1);
				}
				proc.stdout.push(null);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(
			processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')))
		).rejects.toBeInstanceOf(ReceiptRasterizeError);
	});

	it('rejects when the spawn itself fails (ENOENT)', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => proc.emit('error', new Error('spawn ENOENT')));
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never });
		await expect(
			processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')))
		).rejects.toBeInstanceOf(ReceiptRasterizeError);
	});

	it('honors a custom dpi option', async () => {
		const calls: Array<{ cmd: string; args: string[] }> = [];
		const spawnFn = vi.fn((cmd: string, args: string[]) => {
			const proc = makeProc();
			calls.push({ cmd, args });
			queueMicrotask(async () => {
				if (cmd === 'pdfinfo') {
					proc.stdout.push('Pages: 1\n');
					proc.stdout.push(null);
				} else {
					await writePngOutput(args, PNG_BYTES);
				}
				proc.emit('close', 0);
			});
			return proc;
		});

		const processor = createPopplerPdfProcessor({ spawn: spawnFn as never, dpi: 300 });
		await processor.rasterizeFirstPage(makeStream(Buffer.from('%PDF-1.4')));

		expect(calls[1].args).toContain('300');
	});
});
