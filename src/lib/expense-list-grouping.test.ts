import { describe, it, expect } from 'vitest';
import {
	groupExpensesForList,
	sectionExpensesByMonth,
	expenseListItemDate,
	nextVisibleCount,
	hasMoreToLoad,
	filterExpenses,
	countExpensesByGroup,
	RENDER_WINDOW_SIZE,
	UNCATEGORIZED_ID,
	type ExpenseListLike
} from './expense-list-grouping';

interface Entry extends ExpenseListLike {
	id: string;
	description: string;
	categoryName: string | null;
	categoryId: string | null;
	paidByName: string;
}

function entry(
	id: string,
	expenseGroupId: string,
	createdAt: number,
	amountCents = 100,
	date?: number,
	categoryName: string | null = null,
	categoryId: string | null = null,
	paidByName = 'Alice'
): Entry {
	return {
		id,
		expenseGroupId,
		expenseGroupName: null,
		description: `${id} desc`,
		amountCents,
		createdAt: new Date(createdAt),
		date: new Date(date ?? createdAt),
		categoryName,
		categoryId,
		paidByName,
		hasReceipt: false
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
			expenseGroupName: null,
			totalCents: 4000,
			hasReceipt: false,
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

describe('countExpensesByGroup', () => {
	it('counts siblings from the unfiltered list so a lone match still knows its group size', () => {
		const all = [entry('e1', 'g1', 1), entry('e2', 'g1', 2), entry('e3', 'g1', 3)];

		const counts = countExpensesByGroup(all);
		const matched = filterExpenses(all, {
			search: 'e2 desc',
			categoryIds: null,
			payerNames: null,
			dateRange: null
		});

		expect(matched).toHaveLength(1);
		expect(groupExpensesForList(matched)[0].kind).toBe('single');
		expect(counts.get(matched[0].expenseGroupId)).toBe(3);
	});

	it('counts a true solo expense as one so it gets no group affiliation', () => {
		const all = [entry('solo', 'g1', 1), entry('other', 'g2', 2)];

		expect(countExpensesByGroup(all).get('g1')).toBe(1);
	});

	it('counts a two-child group as two even when both children match', () => {
		const all = [entry('e1', 'g1', 1), entry('e2', 'g1', 2)];

		const matched = filterExpenses(all, {
			search: 'desc',
			categoryIds: null,
			payerNames: null,
			dateRange: null
		});

		expect(matched).toHaveLength(2);
		expect(countExpensesByGroup(all).get('g1')).toBe(2);
	});

	it('counts a null-name group like any other', () => {
		const all = [entry('e1', 'g1', 1), entry('e2', 'g1', 2), entry('e3', 'g1', 3)];
		expect(all.every((e) => e.expenseGroupName === null)).toBe(true);

		expect(countExpensesByGroup(all).get('g1')).toBe(3);
	});

	it('returns an empty map for no expenses', () => {
		expect(countExpensesByGroup([])).toEqual(new Map());
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

describe('filterExpenses', () => {
	it('returns all expenses when the search is null', () => {
		const expenses = [entry('a', 'ga', 1), entry('b', 'gb', 2)];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: null,
				dateRange: null
			})
		).toEqual(expenses);
	});

	it('returns all expenses when the search is empty or whitespace', () => {
		const expenses = [entry('a', 'ga', 1)];

		expect(
			filterExpenses(expenses, { search: '', categoryIds: null, payerNames: null, dateRange: null })
		).toEqual(expenses);
		expect(
			filterExpenses(expenses, {
				search: '   ',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			})
		).toEqual(expenses);
	});

	it('matches expenses by description substring, case-insensitive', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null),
			entry('b', 'gb', 2, 100, undefined, null)
		];
		expenses[0].description = 'Coffee';
		expenses[1].description = 'Groceries';

		expect(
			filterExpenses(expenses, {
				search: 'COFF',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('matches expenses by categoryName substring, case-insensitive', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel')
		];

		expect(
			filterExpenses(expenses, {
				search: 'foo',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('matches expenses by expense group name substring', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null),
			entry('b', 'gb', 2, 100, undefined, null)
		];
		expenses[0].expenseGroupName = 'Paris Trip';

		expect(
			filterExpenses(expenses, {
				search: 'paris',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('matches expense group name case-insensitively', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null),
			entry('b', 'gb', 2, 100, undefined, null)
		];
		expenses[0].expenseGroupName = 'Paris Trip';

		expect(
			filterExpenses(expenses, {
				search: 'PARIS TRIP',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('excludes an expense with a null expense group name that matches nothing else', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null),
			entry('b', 'gb', 2, 100, undefined, null)
		];
		expenses[1].expenseGroupName = 'Paris Trip';

		expect(expenses[0].expenseGroupName).toBeNull();
		expect(() =>
			filterExpenses(expenses, {
				search: 'paris',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			})
		).not.toThrow();
		expect(
			filterExpenses(expenses, {
				search: 'paris',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['b']);
	});

	it('returns no expenses when nothing matches', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel')
		];

		expect(
			filterExpenses(expenses, {
				search: 'nonexistent',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			})
		).toEqual([]);
	});

	it('trims the search before matching', () => {
		const expenses = [entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food')];

		expect(
			filterExpenses(expenses, {
				search: '  food  ',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('preserves the original order of matching expenses', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel'),
			entry('c', 'gc', 3, 100, undefined, 'Food', 'cat-food')
		];

		expect(
			filterExpenses(expenses, {
				search: 'food',
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'c']);
	});

	it('returns all expenses when categoryIds is null or empty', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b']);
		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: [],
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b']);
	});

	it('unions expenses matching any selected category id', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel'),
			entry('c', 'gc', 3, 100, undefined, 'Food', 'cat-food')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: ['cat-food', 'cat-travel'],
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b', 'c']);
		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: ['cat-travel'],
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['b']);
	});

	it('matches uncategorized expenses via the UNCATEGORIZED_ID sentinel', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null, null),
			entry('b', 'gb', 2, 100, undefined, 'Food', 'cat-food')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: [UNCATEGORIZED_ID],
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('combines search and category filters', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel'),
			entry('c', 'gc', 3, 100, undefined, 'Food', 'cat-food')
		];
		expenses[0].description = 'Coffee';
		expenses[1].description = 'Groceries';
		expenses[2].description = 'Coffee';

		expect(
			filterExpenses(expenses, {
				search: 'coff',
				categoryIds: ['cat-food'],
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'c']);
	});

	it('returns all expenses when payerNames is null or empty', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null, null, 'Alice'),
			entry('b', 'gb', 2, 100, undefined, null, null, 'Bob')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: null,
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b']);
		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: [],
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b']);
	});

	it('unions expenses matching any selected payer name', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null, null, 'Alice'),
			entry('b', 'gb', 2, 100, undefined, null, null, 'Bob'),
			entry('c', 'gc', 3, 100, undefined, null, null, 'Alice')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: ['Alice', 'Bob'],
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a', 'b', 'c']);
		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: ['Bob'],
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['b']);
	});

	it('matches payer name exactly, not as a substring', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, null, null, 'Alice'),
			entry('b', 'gb', 2, 100, undefined, null, null, 'Alicia')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: null,
				payerNames: ['Alice'],
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	it('combines payer and category filters', () => {
		const expenses = [
			entry('a', 'ga', 1, 100, undefined, 'Food', 'cat-food', 'Alice'),
			entry('b', 'gb', 2, 100, undefined, 'Travel', 'cat-travel', 'Alice'),
			entry('c', 'gc', 3, 100, undefined, 'Food', 'cat-food', 'Bob')
		];

		expect(
			filterExpenses(expenses, {
				search: null,
				categoryIds: ['cat-food'],
				payerNames: ['Alice'],
				dateRange: null
			}).map((e) => e.id)
		).toEqual(['a']);
	});

	describe('dateRange', () => {
		it('returns all expenses when dateRange is null', () => {
			const expenses = [
				entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 1)),
				entry('b', 'gb', 2, 100, Date.UTC(2026, 7, 1))
			];

			expect(
				filterExpenses(expenses, {
					search: null,
					categoryIds: null,
					payerNames: null,
					dateRange: null
				}).map((e) => e.id)
			).toEqual(['a', 'b']);
		});

		it('keeps expenses whose date falls within the inclusive range', () => {
			const expenses = [
				entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 1)),
				entry('b', 'gb', 2, 100, Date.UTC(2026, 8, 15)),
				entry('c', 'gc', 3, 100, Date.UTC(2026, 8, 30))
			];

			expect(
				filterExpenses(expenses, {
					search: null,
					categoryIds: null,
					payerNames: null,
					dateRange: {
						from: new Date(Date.UTC(2026, 8, 10)),
						to: new Date(Date.UTC(2026, 8, 20, 23, 59, 59, 999))
					}
				}).map((e) => e.id)
			).toEqual(['b']);
		});

		it('includes expenses on the range boundaries', () => {
			const expenses = [
				entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 10)),
				entry('b', 'gb', 2, 100, Date.UTC(2026, 8, 20))
			];

			expect(
				filterExpenses(expenses, {
					search: null,
					categoryIds: null,
					payerNames: null,
					dateRange: {
						from: new Date(Date.UTC(2026, 8, 10)),
						to: new Date(Date.UTC(2026, 8, 20, 23, 59, 59, 999))
					}
				}).map((e) => e.id)
			).toEqual(['a', 'b']);
		});

		it('combines dateRange with a category filter', () => {
			const expenses = [
				entry('a', 'ga', 1, 100, Date.UTC(2026, 8, 1), 'Food', 'cat-food'),
				entry('b', 'gb', 2, 100, Date.UTC(2026, 8, 15), 'Travel', 'cat-travel'),
				entry('c', 'gc', 3, 100, Date.UTC(2026, 8, 15), 'Food', 'cat-food')
			];

			expect(
				filterExpenses(expenses, {
					search: null,
					categoryIds: ['cat-food'],
					payerNames: null,
					dateRange: {
						from: new Date(Date.UTC(2026, 8, 10)),
						to: new Date(Date.UTC(2026, 8, 20, 23, 59, 59, 999))
					}
				}).map((e) => e.id)
			).toEqual(['c']);
		});
	});
});
