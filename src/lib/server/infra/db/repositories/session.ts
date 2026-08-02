import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import type { Database } from '$lib/server/infra/db/types';
import { session } from '$lib/server/infra/db/schema/session';
import { user } from '$lib/server/infra/db/schema/user';
import { eq } from 'drizzle-orm';

const create =
	(db: Database): ISessionRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(session).values(input).returning();
		return row;
	};

const findWithUser =
	(db: Database): ISessionRepository['findWithUser'] =>
	async (id) => {
		const rows = await db
			.select({ session, user })
			.from(session)
			.innerJoin(user, eq(user.id, session.userId))
			.where(eq(session.id, id));

		return rows[0] ?? null;
	};

const updateExpiresAt =
	(db: Database): ISessionRepository['updateExpiresAt'] =>
	async (id, expiresAt) => {
		await db.update(session).set({ expiresAt }).where(eq(session.id, id));
	};

const deleteSession =
	(db: Database): ISessionRepository['delete'] =>
	async (id) => {
		await db.delete(session).where(eq(session.id, id));
	};

export function createSessionRepository(db: Database): ISessionRepository {
	return {
		create: create(db),
		findWithUser: findWithUser(db),
		updateExpiresAt: updateExpiresAt(db),
		delete: deleteSession(db)
	};
}
