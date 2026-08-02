import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import type { Database } from '$lib/server/infra/db/types';
import { identity } from '$lib/server/infra/db/schema/identity';
import { and, eq } from 'drizzle-orm';

const findByProviderSubject =
	(db: Database): IIdentityRepository['findByProviderSubject'] =>
	async (provider, providerSubject) => {
		const rows = await db
			.select()
			.from(identity)
			.where(and(eq(identity.provider, provider), eq(identity.providerSubject, providerSubject)));
		return rows[0] ?? null;
	};

const create =
	(db: Database): IIdentityRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(identity).values(input).returning();
		return row;
	};

export function createIdentityRepository(db: Database): IIdentityRepository {
	return {
		findByProviderSubject: findByProviderSubject(db),
		create: create(db)
	};
}
