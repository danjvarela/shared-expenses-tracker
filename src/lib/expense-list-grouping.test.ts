import { describe, it, expect } from 'vitest';
import { groupExpensesForList, type ExpenseListLike } from './expense-list-grouping';

interface Entry extends ExpenseListLike {
	id: string;
	description: string;
}

function entry(id: string, expenseGroupId: string, createdAt: number, amountCents = 100): Entry {
	return {
		id,
		expenseGroupId,
		description: `${id} desc`,
		amountCents,
		createdAt: new Date(createdAt)
	};
}

describe('groupExpensesForList', () => {
	it('renders a one-child expense group as a single item with no group affordance', () => {
		const items = groupExpensesForList([entry('e1', 'g1', 1)]);

		expect(items).toHaveLength(1);
		expect(items[0]).toEqual({ kind: 'single', expense: entry('e1', 'g1', 1) });
	});

	it('collapses a multi-child expense group into one group item with summed total', () => {
		const items = groupExpensesForList([
			entry('e1', 'g1', 1, 1000),
			entry('e2', 'g1', 2, 2500),
			entry('e3', 'g1', 3, 500)
		]);

		expect(items).toHaveLength(1);
		expect(items[0]).toEqual({
			kind: 'group',
			expenseGroupId: 'g1',
			totalCents: 4000,
			children: [entry('e1', 'g1', 1, 1000), entry('e2', 'g1', 2, 2500), entry('e3', 'g1', 3, 500)]
		});
	});

	it('orders children within a group by createdAt ascending', () => {
		const items = groupExpensesForList([
			entry('e3', 'g1', 30),
			entry('e1', 'g1', 10),
			entry('e2', 'g1', 20)
		]);

		const group = items[0];
		if (group.kind !== 'group') throw new Error('expected group');
		expect(group.children.map((child) => child.id)).toEqual(['e1', 'e2', 'e3']);
	});

	it('preserves first-appearance order across mixed single and multi-child groups', () => {
		const items = groupExpensesForList([
			entry('a1', 'ga', 1),
			entry('b1', 'gb', 2),
			entry('b2', 'gb', 3),
			entry('c1', 'gc', 4)
		]);

		expect(items).toEqual([
			{ kind: 'single', expense: entry('a1', 'ga', 1) },
			{
				kind: 'group',
				expenseGroupId: 'gb',
				totalCents: 200,
				children: [entry('b1', 'gb', 2), entry('b2', 'gb', 3)]
			},
			{ kind: 'single', expense: entry('c1', 'gc', 4) }
		]);
	});

	it('returns an empty list for no expenses', () => {
		expect(groupExpensesForList([])).toEqual([]);
	});
});
