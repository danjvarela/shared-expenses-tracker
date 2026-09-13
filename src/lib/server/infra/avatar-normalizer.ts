import { spawn } from 'node:child_process';
import { WEBP_MIME } from '$lib/server/app/receipt-format';
import { AVATAR_LONG_EDGE } from '$lib/server/app/avatar-format';
import {
	AvatarNormalizeError,
	type IAvatarNormalizer,
	type NormalizedAvatar
} from '$lib/server/app/interfaces/avatar-normalizer';
import { NOOP_LOGGER, type ILogger } from '$lib/server/app/interfaces/logger';

const WEBP_QUALITY = 80;

export type SpawnFn = typeof spawn;

export interface CreateAvatarNormalizerOptions {
	spawn?: SpawnFn;
	logger?: ILogger;
}

export function createAvatarNormalizer({
	spawn: spawnFn = spawn,
	logger = NOOP_LOGGER
}: CreateAvatarNormalizerOptions = {}): IAvatarNormalizer {
	return {
		async normalize(bytes): Promise<NormalizedAvatar> {
			try {
				const input = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
				const webp = await new Promise<Buffer>((resolve, reject) => {
					const proc = spawnFn(
						'magick',
						[
							'-',
							'-resize',
							`${AVATAR_LONG_EDGE}x${AVATAR_LONG_EDGE}>`,
							'-quality',
							String(WEBP_QUALITY),
							'webp:-'
						],
						{ stdio: ['pipe', 'pipe', 'pipe'] }
					);
					const stdout: Buffer[] = [];
					proc.stdout.on('data', (chunk: Buffer) => stdout.push(chunk));
					proc.stderr.on('data', () => {});

					function fail(reason: string): void {
						logger.error('avatar normalize failed', { reason });
						reject(new AvatarNormalizeError());
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
				return { bytes: new Uint8Array(webp), mime: WEBP_MIME };
			} catch (err) {
				if (err instanceof AvatarNormalizeError) throw err;
				const wrapped = new AvatarNormalizeError();
				wrapped.cause = err;
				throw wrapped;
			}
		}
	};
}
