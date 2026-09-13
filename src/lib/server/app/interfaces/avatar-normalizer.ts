import { AppError } from '$lib/server/app/error';

export interface NormalizedAvatar {
	bytes: Uint8Array;
	mime: string;
}

export interface IAvatarNormalizer {
	normalize(bytes: Uint8Array, mime: string): Promise<NormalizedAvatar>;
}

export class AvatarNormalizeError extends AppError {
	constructor(message = 'Could not process this image. Try a different file.') {
		super(message, 422);
	}
}
