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

const findByUserIdAndProvider =
	(db: Database): IIdentityRepository['findByUserIdAndProvider'] =>
	async (userId, provider) => {
		const rows = await db
			.select()
			.from(identity)
			.where(and(eq(identity.userId, userId), eq(identity.provider, provider)));
		return rows[0] ?? null;
	};

const create =
	(db: Database): IIdentityRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(identity).values(input).returning();
		return row;
	};

const hasIdentityForUser =
	(db: Database): IIdentityRepository['hasIdentityForUser'] =>
	async (userId) => {
		const [row] = await db
			.select({ id: identity.id })
			.from(identity)
			.where(eq(identity.userId, userId))
			.limit(1);
		return row !== undefined;
	};

const deleteAllForUser =
	(db: Database): IIdentityRepository['deleteAllForUser'] =>
	async (userId) => {
		await db.delete(identity).where(eq(identity.userId, userId));
	};

export function createIdentityRepository(db: Database): IIdentityRepository {
	return {
		findByProviderSubject: findByProviderSubject(db),
		findByUserIdAndProvider: findByUserIdAndProvider(db),
		create: create(db),
		hasIdentityForUser: hasIdentityForUser(db),
		deleteAllForUser: deleteAllForUser(db)
	};
}
