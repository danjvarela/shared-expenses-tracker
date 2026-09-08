import type { Category } from '$lib/server/domain/category';

export interface ICategoryRepository {
	getAll(): Promise<Array<Category>>;

	getDefaults(): Promise<Array<Category>>;

	getAllForGroup(groupId: string): Promise<Array<Category>>;

	findByOwnerAndName(ownerGroupId: string, name: string): Promise<Category | null>;

	create(input: { name: string; icon: string; ownerGroupId: string }): Promise<Category>;

	addToGroup(groupId: string, categoryId: string): Promise<void>;

	removeFromGroup(groupId: string, categoryId: string): Promise<void>;
}
