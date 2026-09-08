import { describe, it, expect } from 'vitest';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Category } from '$lib/server/domain/category';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import {
	createCategoryService,
	DuplicateCategoryNameError,
	CategoryNotEditableError,
	type CategoryRepos
} from './category';

function fakeCategoryRepo(existing: Array<Category> = []): ICategoryRepository & {
	created: Array<{ name: string; icon: string; ownerGroupId: string }>;
	addedToGroup: Array<{ groupId: string; categoryId: string }>;
	removedFromGroup: Array<{ groupId: string; categoryId: string }>;
	deleted: Array<string>;
	updated: Array<{ categoryId: string; name: string; icon: string }>;
} {
	const created: Array<{ name: string; icon: string; ownerGroupId: string }> = [];
	const addedToGroup: Array<{ groupId: string; categoryId: string }> = [];
	const removedFromGroup: Array<{ groupId: string; categoryId: string }> = [];
	const deleted: Array<string> = [];
	const updated: Array<{ categoryId: string; name: string; icon: string }> = [];
	let nextId = 1;
	return {
		created,
		addedToGroup,
		removedFromGroup,
		deleted,
		updated,
		async getAll() {
			return existing;
		},
		async getDefaults() {
			return existing.filter((c) => c.ownerGroupId === null);
		},
		async getAllForGroup() {
			return [];
		},
		async findById(categoryId) {
			return existing.find((c) => c.id === categoryId) ?? null;
		},
		async findByOwnerAndName(ownerGroupId, name) {
			return existing.find((c) => c.name === name) ?? null;
		},
		async create(input) {
			created.push(input);
			const row = {
				id: `cat-${nextId++}`,
				name: input.name,
				icon: input.icon,
				ownerGroupId: input.ownerGroupId,
				createdAt: new Date()
			};
			return row;
		},
		async addToGroup(groupId, categoryId) {
			addedToGroup.push({ groupId, categoryId });
		},
		async removeFromGroup(groupId, categoryId) {
			removedFromGroup.push({ groupId, categoryId });
		},
		async delete(categoryId) {
			deleted.push(categoryId);
		},
		async update(categoryId, input) {
			updated.push({ categoryId, ...input });
			const found = existing.find((c) => c.id === categoryId)!;
			return { ...found, name: input.name, icon: input.icon };
		}
	};
}

function fakeUow(repos: CategoryRepos): IUnitOfWork<CategoryRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

describe('createCategoryService', () => {
	it('creates a category owned by the group and links it to the group', async () => {
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ categoryRepo });
		const service = createCategoryService({ uow, categoryRepo });

		const created = await service.addCustomCategory('group-1', 'Groceries', '🛒');

		expect(created).toMatchObject({ name: 'Groceries', icon: '🛒' });
		expect(categoryRepo.created).toEqual([
			{ name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1' }
		]);
		expect(categoryRepo.addedToGroup).toEqual([{ groupId: 'group-1', categoryId: created.id }]);
	});

	it('rejects a duplicate name within the same owner group', async () => {
		const categoryRepo = fakeCategoryRepo([
			{ id: 'cat-existing', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1', createdAt: new Date() }
		]);
		const uow = fakeUow({ categoryRepo });
		const service = createCategoryService({ uow, categoryRepo });

		await expect(service.addCustomCategory('group-1', 'Groceries', '🛒')).rejects.toThrow(
			DuplicateCategoryNameError
		);
		expect(categoryRepo.created).toEqual([]);
	});

	it('trims name and icon before creating and checking for duplicates', async () => {
		const categoryRepo = fakeCategoryRepo();
		const uow = fakeUow({ categoryRepo });
		const service = createCategoryService({ uow, categoryRepo });

		await service.addCustomCategory('group-1', '  Groceries  ', ' 🛒 ');

		expect(categoryRepo.created).toEqual([
			{ name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1' }
		]);
	});

	it('lists categories linked to a group', async () => {
		const categoryRepo: ICategoryRepository = {
			...fakeCategoryRepo(),
			async getAllForGroup(groupId) {
				return groupId === 'group-1'
					? [{ id: 'cat-1', name: 'Rent', icon: '🏠', ownerGroupId: null, createdAt: new Date() }]
					: [];
			}
		};
		const uow = fakeUow({ categoryRepo });
		const service = createCategoryService({ uow, categoryRepo });

		expect(await service.getForGroup('group-1')).toMatchObject([{ id: 'cat-1' }]);
	});

	describe('removeCategory', () => {
		it('unlinks a default category from the group without deleting it', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Rent', icon: '🏠', ownerGroupId: null, createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await service.removeCategory('group-1', 'cat-1');

			expect(categoryRepo.removedFromGroup).toEqual([{ groupId: 'group-1', categoryId: 'cat-1' }]);
			expect(categoryRepo.deleted).toEqual([]);
		});

		it('hard-deletes a custom category owned by the group', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await service.removeCategory('group-1', 'cat-1');

			expect(categoryRepo.deleted).toEqual(['cat-1']);
			expect(categoryRepo.removedFromGroup).toEqual([]);
		});

		it('does not delete a custom category owned by a different group', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-2', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await service.removeCategory('group-1', 'cat-1');

			expect(categoryRepo.deleted).toEqual([]);
			expect(categoryRepo.removedFromGroup).toEqual([]);
		});

		it('does nothing when the category does not exist', async () => {
			const categoryRepo = fakeCategoryRepo();
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await service.removeCategory('group-1', 'missing');

			expect(categoryRepo.deleted).toEqual([]);
			expect(categoryRepo.removedFromGroup).toEqual([]);
		});
	});

	describe('editCategory', () => {
		it('updates name and icon of a category owned by the group', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			const updated = await service.editCategory('group-1', 'cat-1', 'Food', '🍔');

			expect(updated).toMatchObject({ name: 'Food', icon: '🍔' });
			expect(categoryRepo.updated).toEqual([{ categoryId: 'cat-1', name: 'Food', icon: '🍔' }]);
		});

		it('rejects editing a default category', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Rent', icon: '🏠', ownerGroupId: null, createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await expect(service.editCategory('group-1', 'cat-1', 'Housing', '🏠')).rejects.toThrow(
				CategoryNotEditableError
			);
			expect(categoryRepo.updated).toEqual([]);
		});

		it('rejects editing a custom category owned by a different group', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-2', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await expect(service.editCategory('group-1', 'cat-1', 'Food', '🍔')).rejects.toThrow(
				CategoryNotEditableError
			);
			expect(categoryRepo.updated).toEqual([]);
		});

		it('rejects a duplicate name within the same owner group', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1', createdAt: new Date() },
				{ id: 'cat-2', name: 'Food', icon: '🍔', ownerGroupId: 'group-1', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await expect(service.editCategory('group-1', 'cat-1', 'Food', '🛒')).rejects.toThrow(
				DuplicateCategoryNameError
			);
			expect(categoryRepo.updated).toEqual([]);
		});

		it('allows editing a category to its own current name', async () => {
			const categoryRepo = fakeCategoryRepo([
				{ id: 'cat-1', name: 'Groceries', icon: '🛒', ownerGroupId: 'group-1', createdAt: new Date() }
			]);
			const uow = fakeUow({ categoryRepo });
			const service = createCategoryService({ uow, categoryRepo });

			await service.editCategory('group-1', 'cat-1', 'Groceries', '🛍️');

			expect(categoryRepo.updated).toEqual([{ categoryId: 'cat-1', name: 'Groceries', icon: '🛍️' }]);
		});
	});
});
