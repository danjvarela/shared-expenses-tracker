import type { ISessionRepository } from '$lib/server/app/interfaces/repositories/session';
import { db } from '$lib/server/infra/db';
import { session } from '$lib/server/infra/db/schema/session';
import { user } from '$lib/server/infra/db/schema/user';
import { eq } from 'drizzle-orm';

export const create: ISessionRepository['create'] = async (input) => {
	const [row] = await db.insert(session).values(input).returning();
	return row;
};

export const findWithUser: ISessionRepository['findWithUser'] = async (id) => {
	const rows = await db
		.select({ session, user })
		.from(session)
		.innerJoin(user, eq(user.id, session.userId))
		.where(eq(session.id, id));

	return rows[0] ?? null;
};

export const updateExpiresAt: ISessionRepository['updateExpiresAt'] = async (id, expiresAt) => {
	await db.update(session).set({ expiresAt }).where(eq(session.id, id));
};

export const deleteSession: ISessionRepository['delete'] = async (id) => {
	await db.delete(session).where(eq(session.id, id));
};
