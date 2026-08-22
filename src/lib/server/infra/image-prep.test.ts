import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { prepareImage } from './image-prep';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';

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

const FAKE_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4, 0xff, 0xd9]);
const INPUT = Buffer.from([10, 20, 30, 40, 50]);

describe('prepareImage', () => {
	it('invokes magick with the resize/quality args and a JPEG stdout target', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(FAKE_JPEG);
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		await prepareImage(INPUT, spawnFn as never);

		expect(spawnFn).toHaveBeenCalledTimes(1);
		const [cmd, args] = (spawnFn as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [
			string,
			string[]
		];
		expect(cmd).toBe('magick');
		expect(args).toEqual(['-', '-resize', '1568x1568>', '-quality', '80', 'jpg:-']);
	});

	it('pipes the input to magick stdin and returns the prepared stdout bytes', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(FAKE_JPEG);
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		const result = await prepareImage(INPUT, spawnFn as never);

		expect(result).toEqual(FAKE_JPEG);
	});

	it('throws ReceiptScannerError when ImageMagick exits non-zero', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('magick: decode error\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});

		await expect(prepareImage(INPUT, spawnFn as never)).rejects.toBeInstanceOf(ReceiptScannerError);
	});

	it('throws ReceiptScannerError when ImageMagick emits no image', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});

		await expect(prepareImage(INPUT, spawnFn as never)).rejects.toBeInstanceOf(ReceiptScannerError);
	});

	it('throws ReceiptScannerError when the ImageMagick spawn itself fails (ENOENT)', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => proc.emit('error', new Error('spawn ENOENT')));
			return proc;
		});

		await expect(prepareImage(INPUT, spawnFn as never)).rejects.toBeInstanceOf(ReceiptScannerError);
	});
});
