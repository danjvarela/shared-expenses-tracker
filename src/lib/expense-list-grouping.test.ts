import { describe, it, expect } from 'vitest';
import {
	groupExpensesForList,
	sectionExpensesByMonth,
	expenseListItemDate,
	nextVisibleCount,
	hasMoreToLoad,
	RENDER_WINDOW_SIZE,
	type ExpenseListLike
} from './expense-list-grouping';

interface Entry extends ExpenseListLike {
	id: string;
	description: string;
}

function entry(
	id: string,
	expenseGroupId: string,
	createdAt: number,
	amountCents = 100,
	date?: number
): Entry {
	return {
		id,
		expenseGroupId,
		description: `${id} desc`,
		amountCents,
		createdAt: new Date(createdAt),
		date: new Date(date ?? createdAt)
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

	it('sorts items by date descending', () => {
		const items = groupExpensesForList([
			entry('a1', 'ga', 1, 100, Date.UTC(2026, 7, 5)),
			entry('c1', 'gc', 4, 100, Date.UTC(2026, 8, 20)),
			entry('b1', 'gb', 2, 100, Date.UTC(2026, 8, 3))
		]);

		expect(items.map((i) => (i.kind === 'single' ? i.expense.id : ''))).toEqual(['c1', 'b1', 'a1']);
	});

	it('breaks date ties by createdAt descending', () => {
		const items = groupExpensesForList([
			entry('old', 'g1', 100, 100, Date.UTC(2026, 8, 1)),
			entry('new', 'g2', 200, 100, Date.UTC(2026, 8, 1))
		]);

		expect(items.map((i) => (i.kind === 'single' ? i.expense.id : ''))).toEqual(['new', 'old']);
	});

	it('orders a multi-child group by its latest child date', () => {
		const items = groupExpensesForList([
			entry('c1', 'g1', 10, 100, Date.UTC(2026, 8, 10)),
			entry('c2', 'g1', 20, 100, Date.UTC(2026, 7, 5)),
			entry('s', 'g2', 30, 100, Date.UTC(2026, 8, 8))
		]);

		expect(items.map((i) => (i.kind === 'group' ? i.expenseGroupId : i.expense.id))).toEqual([
			'g1',
			's'
		]);
	});

	it('returns an empty list for no expenses', () => {
		expect(groupExpensesForList([])).toEqual([]);
	});
});

describe('sectionExpensesByMonth', () => {
	it('groups items into month sections with the latest month first', () => {
		const items = groupExpensesForList([
			entry('a', 'ga', 1, 100, Date.UTC(2026, 7, 5)),
			entry('b', 'gb', 2, 100, Date.UTC(2026, 8, 3)),
			entry('c', 'gc', 3, 100, Date.UTC(2026, 8, 20))
		]);

		const sections = sectionExpensesByMonth(items);

		expect(sections.map((s) => s.monthKey)).toEqual(['2026-09', '2026-08']);
		expect(sections[0].items.map((i) => (i.kind === 'single' ? i.expense.id : ''))).toEqual([
			'c',
			'b'
		]);
		expect(sections[1].items.map((i) => (i.kind === 'single' ? i.expense.id : ''))).toEqual(['a']);
	});

	it('formats monthKey as YYYY-MM and monthLabel as "Month Year"', () => {
		const items = groupExpensesForList([entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 3))]);

		const [section] = sectionExpensesByMonth(items);

		expect(section.monthKey).toBe('2026-09');
		expect(section.monthLabel).toBe('September 2026');
	});

	it('sections a multi-child group by its latest child date', () => {
		const items = groupExpensesForList([
			entry('c1', 'g1', 10, 100, Date.UTC(2026, 8, 10)),
			entry('c2', 'g1', 20, 100, Date.UTC(2026, 7, 5)),
			entry('s', 'g2', 30, 100, Date.UTC(2026, 8, 8))
		]);

		const sections = sectionExpensesByMonth(items);

		expect(sections).toHaveLength(1);
		expect(sections[0].monthKey).toBe('2026-09');
		expect(sections[0].items[0].kind).toBe('group');
		expect(sections[0].items[1].kind).toBe('single');
	});

	it('returns an empty list for no items', () => {
		expect(sectionExpensesByMonth([])).toEqual([]);
	});
});

describe('expenseListItemDate', () => {
	it('returns the expense date for a single item', () => {
		const [item] = groupExpensesForList([entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 3))]);

		expect(expenseListItemDate(item).valueOf()).toBe(Date.UTC(2026, 8, 3));
	});

	it('returns the latest child date for a multi-child group, not the earliest-createdAt child date', () => {
		// earliest-createdAt child (c1) has the earlier date; latest-date child (c2) has later createdAt
		const [item] = groupExpensesForList([
			entry('c1', 'g1', 10, 100, Date.UTC(2026, 7, 5)),
			entry('c2', 'g1', 20, 100, Date.UTC(2026, 8, 10))
		]);

		if (item.kind !== 'group') throw new Error('expected group');
		expect(item.children[0].id).toBe('c1'); // sorted by createdAt asc
		expect(expenseListItemDate(item).valueOf()).toBe(Date.UTC(2026, 8, 10));
	});
});

describe('render window', () => {
	it('exposes a render window size of 20', () => {
		expect(RENDER_WINDOW_SIZE).toBe(20);
	});

	it('loads the next window batch, capped at the total row count', () => {
		expect(nextVisibleCount(20, 50)).toBe(40);
		expect(nextVisibleCount(40, 50)).toBe(50);
	});

	it('loads all remaining rows when fewer than a window remain', () => {
		expect(nextVisibleCount(20, 25)).toBe(25);
		expect(nextVisibleCount(20, 21)).toBe(21);
	});

	it('does not advance past the total when exactly at the boundary', () => {
		expect(nextVisibleCount(20, 20)).toBe(20);
		expect(nextVisibleCount(50, 50)).toBe(50);
	});

	it('reports more rows to load while the visible count is below the total', () => {
		expect(hasMoreToLoad(20, 50)).toBe(true);
		expect(hasMoreToLoad(40, 50)).toBe(true);
	});

	it('reports no more rows when the visible count reaches the total', () => {
		expect(hasMoreToLoad(50, 50)).toBe(false);
		expect(hasMoreToLoad(20, 20)).toBe(false);
		expect(hasMoreToLoad(0, 0)).toBe(false);
	});
});
