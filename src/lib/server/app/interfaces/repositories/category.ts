import type { Category } from '$lib/server/domain/category';

export interface ICategoryRepository {
	getAll(): Promise<Array<Category>>;

	getDefaults(): Promise<Array<Category>>;

	getAllForGroup(groupId: string): Promise<Array<Category>>;

	addToGroup(groupId: string, categoryId: string): Promise<void>;

	removeFromGroup(groupId: string, categoryId: string): Promise<void>;
}
