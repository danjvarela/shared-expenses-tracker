import type { IExpenseRepository } from '$lib/server/app/interfaces/repositories/expense';
import type { ICategoryRepository } from '$lib/server/app/interfaces/repositories/category';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';

export interface DashboardDeps {
	expenseRepo: IExpenseRepository;
	categoryRepo: ICategoryRepository;
	groupRepo: IGroupRepository;
}

export interface CategoryBreakdownEntry {
	categoryId: string | null;
	name: string;
	icon: string | null;
	amountCents: number;
}

export interface GroupBreakdownEntry {
	groupId: string;
	groupName: string;
	currencyCode: string;
	amountCents: number;
}

export interface GroupDashboard {
	currentMonthTotalCents: number;
	months: Array<string>;
	categoryBreakdown: Array<CategoryBreakdownEntry>;
	averagePerMonthCents: number;
	averagePerDayCents: number;
}

export interface HomepageDashboard {
	currentMonthTotalCents: number;
	months: Array<string>;
	groupBreakdown: Array<GroupBreakdownEntry>;
	averagePerMonthCents: number;
	averagePerDayCents: number;
}

const UNCATEGORIZED_NAME = 'Uncategorized';

function monthKey(date: Date): string {
	return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function monthsBetweenInclusive(start: Date, end: Date): number {
	return (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth()) + 1;
}

function daysBetweenInclusive(start: Date, end: Date): number {
	const startDay = Date.UTC(start.getFullYear(), start.getMonth(), start.getDate());
	const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
	return Math.floor((endDay - startDay) / (24 * 60 * 60 * 1000)) + 1;
}

function earliestDate(dates: Array<Date>): Date | null {
	if (dates.length === 0) return null;
	return dates.reduce((earliest, date) => (date < earliest ? date : earliest));
}

function monthsWithActivity(dates: Array<Date>): Array<string> {
	return [...new Set(dates.map(monthKey))].sort((a, b) => b.localeCompare(a));
}

function computeAverages(
	items: Array<{ date: Date; amountCents: number }>,
	now: Date
): { averagePerMonthCents: number; averagePerDayCents: number } {
	const earliest = earliestDate(items.map((item) => item.date));
	if (!earliest) return { averagePerMonthCents: 0, averagePerDayCents: 0 };

	const totalCents = items.reduce((sum, item) => sum + item.amountCents, 0);
	return {
		averagePerMonthCents: Math.round(totalCents / monthsBetweenInclusive(earliest, now)),
		averagePerDayCents: Math.round(totalCents / daysBetweenInclusive(earliest, now))
	};
}

export function createDashboardService(deps: DashboardDeps) {
	async function getGroupDashboard(groupId: string, month?: string): Promise<GroupDashboard> {
		const now = new Date();
		const currentMonth = monthKey(now);

		const [expenses, categories] = await Promise.all([
			deps.expenseRepo.getAllForGroupWithSplits(groupId),
			deps.categoryRepo.getAllForGroup(groupId)
		]);
		const categoryById = new Map(categories.map((category) => [category.id, category]));

		const currentMonthTotalCents = expenses
			.filter((expense) => monthKey(expense.date) === currentMonth)
			.reduce((sum, expense) => sum + expense.amountCents, 0);

		const months = monthsWithActivity(expenses.map((expense) => expense.date));
		const targetMonth = month ?? months[0] ?? currentMonth;

		const breakdownByCategory = new Map<string | null, number>();
		for (const expense of expenses) {
			if (monthKey(expense.date) !== targetMonth) continue;
			const current = breakdownByCategory.get(expense.categoryId) ?? 0;
			breakdownByCategory.set(expense.categoryId, current + expense.amountCents);
		}
		const missingCategoryIds = [...breakdownByCategory.keys()].filter(
			(categoryId): categoryId is string => categoryId !== null && !categoryById.has(categoryId)
		);
		const missingCategories = await Promise.all(
			missingCategoryIds.map((categoryId) => deps.categoryRepo.findById(categoryId))
		);
		missingCategories.forEach((category) => {
			if (category) categoryById.set(category.id, category);
		});
		const categoryBreakdown = [...breakdownByCategory.entries()]
			.map(([categoryId, amountCents]) => {
				const category = categoryId ? categoryById.get(categoryId) : undefined;
				return {
					categoryId,
					name: categoryId === null ? UNCATEGORIZED_NAME : (category?.name ?? UNCATEGORIZED_NAME),
					icon: category?.icon ?? null,
					amountCents
				};
			})
			.sort((a, b) => b.amountCents - a.amountCents);

		const { averagePerMonthCents, averagePerDayCents } = computeAverages(expenses, now);

		return {
			currentMonthTotalCents,
			months,
			categoryBreakdown,
			averagePerMonthCents,
			averagePerDayCents
		};
	}

	async function getHomepageDashboard(userId: string, month?: string): Promise<HomepageDashboard> {
		const now = new Date();
		const currentMonth = monthKey(now);
		const targetMonth = month ?? currentMonth;

		const groups = await deps.groupRepo.getAll(userId);
		const groupExpenses = await Promise.all(
			groups.map((group) => deps.expenseRepo.getAllForGroupWithSplits(group.id))
		);

		const userSplits: Array<{ groupId: string; date: Date; amountCents: number }> = [];
		groups.forEach((group, index) => {
			for (const expense of groupExpenses[index]) {
				for (const split of expense.splits) {
					if (split.userId !== userId) continue;
					userSplits.push({
						groupId: group.id,
						date: expense.date,
						amountCents: split.amountCents
					});
				}
			}
		});

		const currentMonthTotalCents = userSplits
			.filter((split) => monthKey(split.date) === currentMonth)
			.reduce((sum, split) => sum + split.amountCents, 0);

		const months = monthsWithActivity(userSplits.map((split) => split.date));

		const breakdownByGroup = new Map<string, number>();
		for (const split of userSplits) {
			if (monthKey(split.date) !== targetMonth) continue;
			const current = breakdownByGroup.get(split.groupId) ?? 0;
			breakdownByGroup.set(split.groupId, current + split.amountCents);
		}
		const groupById = new Map(groups.map((group) => [group.id, group]));
		const groupBreakdown = [...breakdownByGroup.entries()]
			.map(([groupId, amountCents]) => {
				const group = groupById.get(groupId);
				return {
					groupId,
					groupName: group?.name ?? '',
					currencyCode: group?.currencyCode ?? '',
					amountCents
				};
			})
			.sort((a, b) => b.amountCents - a.amountCents);

		const { averagePerMonthCents, averagePerDayCents } = computeAverages(userSplits, now);

		return {
			currentMonthTotalCents,
			months,
			groupBreakdown,
			averagePerMonthCents,
			averagePerDayCents
		};
	}

	return { getGroupDashboard, getHomepageDashboard };
}

export type DashboardService = ReturnType<typeof createDashboardService>;
