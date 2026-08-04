import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Database } from '$lib/server/infra/db/types';
import { category } from '$lib/server/infra/db/schema/category';

const getAll =
	(db: Database): ICategoryRepository['getAll'] =>
	async () => {
		return await db.select().from(category);
	};

export function createCategoryRepository(db: Database): ICategoryRepository {
	return {
		getAll: getAll(db)
	};
}
