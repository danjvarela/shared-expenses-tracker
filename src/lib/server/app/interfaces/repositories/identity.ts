import type { Identity } from '$lib/server/domain/identity';

export interface IIdentityRepository {
	findByProviderSubject(provider: string, providerSubject: string): Promise<Identity | null>;
	create(input: { userId: string; provider: string; providerSubject: string }): Promise<Identity>;
}
