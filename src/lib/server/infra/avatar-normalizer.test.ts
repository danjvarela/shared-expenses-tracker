import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { Writable } from 'node:stream';
import { createAvatarNormalizer } from './avatar-normalizer';
import { PNG_MIME, WEBP_MIME } from '$lib/server/app/receipt-format';
import { AvatarNormalizeError } from '$lib/server/app/interfaces/avatar-normalizer';

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

const WEBP_BYTES = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe('createAvatarNormalizer.normalize', () => {
	it('resizes the image and re-encodes to webp via magick', async () => {
		const captured: { cmd?: string; args?: string[] } = {};
		const spawnFn = vi.fn((cmd: string, args: string[]) => {
			captured.cmd = cmd;
			captured.args = args;
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(WEBP_BYTES);
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});
		const normalizer = createAvatarNormalizer({ spawn: spawnFn as never });

		const result = await normalizer.normalize(Buffer.from([10, 20, 30]), PNG_MIME);

		expect(result.mime).toBe(WEBP_MIME);
		expect(Buffer.from(result.bytes).equals(WEBP_BYTES)).toBe(true);
		expect(spawnFn).toHaveBeenCalledTimes(1);
		expect(captured.cmd).toBe('magick');
		expect(captured.args).toContain('512x512>');
		expect(captured.args).toContain('webp:-');
	});

	it('wraps a magick exit failure as AvatarNormalizeError', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stderr.push('magick: decode error\n');
				proc.stderr.push(null);
				proc.emit('close', 1);
			});
			return proc;
		});
		const normalizer = createAvatarNormalizer({ spawn: spawnFn as never });

		await expect(normalizer.normalize(Buffer.from([1, 2, 3]), PNG_MIME)).rejects.toBeInstanceOf(
			AvatarNormalizeError
		);
	});

	it('wraps a magick spawn error as AvatarNormalizeError', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => proc.emit('error', new Error('enoent')));
			return proc;
		});
		const normalizer = createAvatarNormalizer({ spawn: spawnFn as never });

		await expect(normalizer.normalize(Buffer.from([1, 2, 3]), PNG_MIME)).rejects.toBeInstanceOf(
			AvatarNormalizeError
		);
	});

	it('wraps an empty output as AvatarNormalizeError', async () => {
		const spawnFn = vi.fn(() => {
			const proc = makeProc();
			queueMicrotask(() => {
				proc.stdout.push(null);
				proc.emit('close', 0);
			});
			return proc;
		});
		const normalizer = createAvatarNormalizer({ spawn: spawnFn as never });

		await expect(normalizer.normalize(Buffer.from([1, 2, 3]), PNG_MIME)).rejects.toBeInstanceOf(
			AvatarNormalizeError
		);
	});

	it('surfaces the friendly 422 status', () => {
		const err = new AvatarNormalizeError();
		expect(err.status).toBe(422);
		expect(err.message).toBe('Could not process this image. Try a different file.');
	});
});
