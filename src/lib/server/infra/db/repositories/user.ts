import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import { db } from '$lib/server/infra/db';
import { user } from '$lib/server/infra/db/schema/user';
import { eq } from 'drizzle-orm';

export const findByEmail: IUserRepository['findByEmail'] = async (email) => {
	const rows = await db.select().from(user).where(eq(user.email, email));
	return rows[0] ?? null;
};

export const create: IUserRepository['create'] = async (input) => {
	const [row] = await db.insert(user).values(input).returning();
	return row;
};
