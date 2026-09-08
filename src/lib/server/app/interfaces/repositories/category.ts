import type { Category } from '$lib/server/domain/category';

export interface ICategoryRepository {
	getAll(): Promise<Array<Category>>;

	getDefaults(): Promise<Array<Category>>;

	getAllForGroup(groupId: string): Promise<Array<Category>>;

	findById(categoryId: string): Promise<Category | null>;

	findByOwnerAndName(ownerGroupId: string, name: string): Promise<Category | null>;

	create(input: { name: string; icon: string; ownerGroupId: string }): Promise<Category>;

	update(categoryId: string, input: { name: string; icon: string }): Promise<Category>;

	addToGroup(groupId: string, categoryId: string): Promise<void>;

	removeFromGroup(groupId: string, categoryId: string): Promise<void>;

	delete(categoryId: string): Promise<void>;
}
