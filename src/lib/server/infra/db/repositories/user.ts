import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { Database } from '$lib/server/infra/db/types';
import { user } from '$lib/server/infra/db/schema/user';
import { eq } from 'drizzle-orm';

const findByEmail =
	(db: Database): IUserRepository['findByEmail'] =>
	async (email) => {
		const rows = await db.select().from(user).where(eq(user.email, email));
		return rows[0] ?? null;
	};

const create =
	(db: Database): IUserRepository['create'] =>
	async (input) => {
		const [row] = await db.insert(user).values(input).returning();
		return row;
	};

export function createUserRepository(db: Database): IUserRepository {
	return {
		findByEmail: findByEmail(db),
		create: create(db)
	};
}
