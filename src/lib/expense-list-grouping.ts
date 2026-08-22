export interface ExpenseListLike {
	expenseGroupId: string;
	amountCents: number;
	createdAt: Date;
}

export type ExpenseListItem<E> =
	| { kind: 'single'; expense: E }
	| { kind: 'group'; expenseGroupId: string; children: E[]; totalCents: number };

export function groupExpensesForList<E extends ExpenseListLike>(
	expenses: E[]
): ExpenseListItem<E>[] {
	const order: string[] = [];
	const byGroup = new Map<string, E[]>();

	for (const expense of expenses) {
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

		const sorted = [...children].sort((a, b) => a.createdAt.valueOf() - b.createdAt.valueOf());
		const totalCents = sorted.reduce((sum, child) => sum + child.amountCents, 0);
		return { kind: 'group' as const, expenseGroupId, children: sorted, totalCents };
	});
}
