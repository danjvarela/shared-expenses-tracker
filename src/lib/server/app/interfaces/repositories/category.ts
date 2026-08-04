import type { Category } from '$lib/server/domain/category';

export interface ICategoryRepository {
	getAll(): Promise<Array<Category>>;
}
