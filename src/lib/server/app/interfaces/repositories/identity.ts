import type { Identity } from '$lib/server/domain/identity';

export interface IIdentityRepository {
	findByProviderSubject(provider: string, providerSubject: string): Promise<Identity | null>;
	findByUserIdAndProvider(userId: string, provider: string): Promise<Identity | null>;
	create(input: {
		userId: string;
		provider: string;
		providerSubject: string;
		passwordHash?: string;
	}): Promise<Identity>;
	hasIdentityForUser(userId: string): Promise<boolean>;
	deleteAllForUser(userId: string): Promise<void>;
}
