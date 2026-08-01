import type { IIdentityRepository } from '$lib/server/app/interfaces/repositories/identity';
import { db } from '$lib/server/infra/db';
import { identity } from '$lib/server/infra/db/schema/identity';
import { and, eq } from 'drizzle-orm';

export const findByProviderSubject: IIdentityRepository['findByProviderSubject'] = async (
	provider,
	providerSubject
) => {
	const rows = await db
		.select()
		.from(identity)
		.where(and(eq(identity.provider, provider), eq(identity.providerSubject, providerSubject)));
	return rows[0] ?? null;
};

export const create: IIdentityRepository['create'] = async (input) => {
	const [row] = await db.insert(identity).values(input).returning();
	return row;
};
