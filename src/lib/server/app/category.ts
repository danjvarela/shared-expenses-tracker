import { AppError } from '$lib/server/app/error';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { Category } from '$lib/server/domain/category';

export interface CategoryRepos {
	categoryRepo: ICategoryRepository;
}

export class DuplicateCategoryNameError extends AppError {
	constructor() {
		super('A category with this name already exists in this group');
	}
}

export function createCategoryService(deps: {
	uow: IUnitOfWork<CategoryRepos>;
	categoryRepo: ICategoryRepository;
}) {
	async function addCustomCategory(groupId: string, name: string, icon: string): Promise<Category> {
		const trimmedName = name.trim();
		const trimmedIcon = icon.trim();

		return deps.uow.run(async ({ categoryRepo }) => {
			const existing = await categoryRepo.findByOwnerAndName(groupId, trimmedName);
			if (existing) throw new DuplicateCategoryNameError();

			const created = await categoryRepo.create({
				name: trimmedName,
				icon: trimmedIcon,
				ownerGroupId: groupId
			});
			await categoryRepo.addToGroup(groupId, created.id);

			return created;
		});
	}

	async function getForGroup(groupId: string): Promise<Array<Category>> {
		return deps.categoryRepo.getAllForGroup(groupId);
	}

	return { addCustomCategory, getForGroup };
}

export type CategoryService = ReturnType<typeof createCategoryService>;
