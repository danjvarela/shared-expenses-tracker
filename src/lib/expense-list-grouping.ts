export interface ExpenseListLike {
	expenseGroupId: string;
	amountCents: number;
	createdAt: Date;
	date: Date;
}

export interface FilterableExpense {
	description: string;
	categoryName: string | null;
}

export interface ExpenseListFilter {
	search: string | null;
}

export function filterExpenses<E extends FilterableExpense>(
	expenses: E[],
	filter: ExpenseListFilter
): E[] {
	const search = filter.search?.trim().toLowerCase();
	if (!search) return expenses;
	return expenses.filter(
		(expense) =>
			expense.description.toLowerCase().includes(search) ||
			(expense.categoryName?.toLowerCase().includes(search) ?? false)
	);
}

export type ExpenseListItem<E> =
	| { kind: 'single'; expense: E }
	| { kind: 'group'; expenseGroupId: string; children: E[]; totalCents: number };

export interface MonthSection<E> {
	monthKey: string;
	monthLabel: string;
	items: ExpenseListItem<E>[];
}

const MONTH_NAMES = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

function monthKey(date: Date): string {
	return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(date: Date): string {
	return `${MONTH_NAMES[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

export function expenseListItemDate<E extends ExpenseListLike>(item: ExpenseListItem<E>): Date {
	if (item.kind === 'single') return item.expense.date;
	return item.children.reduce(
		(max, child) => (child.date.valueOf() > max.valueOf() ? child.date : max),
		item.children[0].date
	);
}

export function groupExpensesForList<E extends ExpenseListLike>(
	expenses: E[]
): ExpenseListItem<E>[] {
	const sorted = [...expenses].sort(
		(a, b) => b.date.valueOf() - a.date.valueOf() || b.createdAt.valueOf() - a.createdAt.valueOf()
	);

	const order: string[] = [];
	const byGroup = new Map<string, E[]>();

	for (const expense of sorted) {
		if (!byGroup.has(expense.expenseGroupId)) {
			order.push(expense.expenseGroupId);
		}
		const children = byGroup.get(expense.expenseGroupId) ?? [];
		children.push(expense);
		byGroup.set(expense.expenseGroupId, children);
	}

	return order.map((expenseGroupId) => {
		const children = byGroup.get(expenseGroupId) as E[];
		if (children.length === 1) {
			return { kind: 'single' as const, expense: children[0] };
		}

		const sortedChildren = [...children].sort(
			(a, b) => a.createdAt.valueOf() - b.createdAt.valueOf()
		);
		const totalCents = sortedChildren.reduce((sum, child) => sum + child.amountCents, 0);
		return { kind: 'group' as const, expenseGroupId, children: sortedChildren, totalCents };
	});
}

export function sectionExpensesByMonth<E extends ExpenseListLike>(
	items: ExpenseListItem<E>[]
): MonthSection<E>[] {
	const sections: MonthSection<E>[] = [];
	for (const item of items) {
		const date = expenseListItemDate(item);
		const key = monthKey(date);
		const last = sections[sections.length - 1];
		if (last && last.monthKey === key) {
			last.items.push(item);
		} else {
			sections.push({ monthKey: key, monthLabel: monthLabel(date), items: [item] });
		}
	}
	return sections;
}

export const RENDER_WINDOW_SIZE = 20;

export function nextVisibleCount(visible: number, total: number): number {
	return Math.min(visible + RENDER_WINDOW_SIZE, total);
}

export function hasMoreToLoad(visible: number, total: number): boolean {
	return visible < total;
}
