import { spawn } from 'node:child_process';
import { ReceiptScannerError } from '$lib/server/app/interfaces/receipt-scanner';

// Cap the request size before sending to a scanner backend: a poppler-rasterized
// PDF at 150 DPI PNG blows past typical request-body limits once base64-encoded,
// and a huge image is wasted bytes. Resize/re-encode to JPEG first.
// See docs/adr/0014-ollama-cloud-image-compression.md.
const MAX_LONG_EDGE = 1568;
const JPEG_QUALITY = 80;
const PREPARE_FAILED_MESSAGE = 'Scanner could not read this image';

export type SpawnFn = typeof spawn;

export function prepareImage(input: Buffer, spawnFn: SpawnFn): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const proc = spawnFn(
			'magick',
			[
				'-',
				'-resize',
				`${MAX_LONG_EDGE}x${MAX_LONG_EDGE}>`,
				'-quality',
				String(JPEG_QUALITY),
				'jpg:-'
			],
			{ stdio: ['pipe', 'pipe', 'pipe'] }
		);
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
		proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));

		function fail(reason: string): void {
			console.error(
				'Receipt image prepare failed',
				reason,
				Buffer.concat(stderr).toString().trim()
			);
			reject(new ReceiptScannerError(PREPARE_FAILED_MESSAGE));
		}

		proc.on('error', () => fail('magick spawn failed'));
		proc.on('close', (code) => {
			if (code !== 0) {
				fail(`magick exited ${code}`);
				return;
			}
			const image = Buffer.concat(stdout);
			if (image.length === 0) {
				fail('magick produced no output');
				return;
			}
			resolve(image);
		});

		proc.stdin.end(input);
	});
}
