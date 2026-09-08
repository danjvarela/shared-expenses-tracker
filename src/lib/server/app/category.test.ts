import { describe, it, expect } from 'vitest';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Category } from '$lib/server/domain/category';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import { createCategoryService, DuplicateCategoryNameError, type CategoryRepos } from './category';

function fakeCategoryRepo(existing: Array<Category> = []): ICategoryRepository & {
	created: Array<{ name: string; icon: string; ownerGroupId: string }>;
	addedToGroup: Array<{ groupId: string; categoryId: string }>;
} {
	const created: Array<{ name: string; icon: string; ownerGroupId: string }> = [];
	const addedToGroup: Array<{ groupId: string; categoryId: string }> = [];
	let nextId = 1;
	return {
		created,
		addedToGroup,
		async getAll() {
			return existing;
		},
		async getDefaults() {
			return existing.filter((c) => c.name === undefined);
		},
		async getAllForGroup() {
			return [];
		},
		async findByOwnerAndName(ownerGroupId, name) {
			return existing.find((c) => c.name === name) ?? null;
		},
		async create(input) {
			created.push(input);
			const row = { id: `cat-${nextId++}`, name: input.name, icon: input.icon, createdAt: new Date() };
			return row;
		},
		async addToGroup(groupId, categoryId) {
			addedToGroup.push({ groupId, categoryId });
		},
		async removeFromGroup() {}
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
			{ id: 'cat-existing', name: 'Groceries', icon: '🛒', createdAt: new Date() }
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
					? [{ id: 'cat-1', name: 'Rent', icon: '🏠', createdAt: new Date() }]
					: [];
			}
		};
		const uow = fakeUow({ categoryRepo });
		const service = createCategoryService({ uow, categoryRepo });

		expect(await service.getForGroup('group-1')).toMatchObject([{ id: 'cat-1' }]);
	});
});
