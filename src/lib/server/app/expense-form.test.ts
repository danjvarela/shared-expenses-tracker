import { describe, it, expect } from 'vitest';
import { validateExpenseForm, parseAmountCents } from './expense-form';

const alice = 'alice';
const bob = 'bob';
const members = [{ userId: alice }, { userId: bob }];

function baseForm(overrides: Record<string, string> = {}) {
	const form = new FormData();
	form.set('description', 'Groceries');
	form.set('amount', '10.00');
	form.set('date', '2026-01-01');
	form.set('paidByUserId', alice);
	form.set('categoryId', 'none');
	form.set('splitMethod', 'equal');
	form.set(`included-${alice}`, 'on');
	form.set(`included-${bob}`, 'on');
	for (const [key, value] of Object.entries(overrides)) {
		form.set(key, value);
	}
	return form;
}

describe('parseAmountCents', () => {
	it('parses pesos into cents', () => {
		expect(parseAmountCents('10.50')).toBe(1050);
	});

	it('returns null for empty or invalid input', () => {
		expect(parseAmountCents('')).toBeNull();
		expect(parseAmountCents('abc')).toBeNull();
		expect(parseAmountCents(null)).toBeNull();
	});
});

describe('validateExpenseForm', () => {
	it('returns validated data for a valid form', () => {
		const result = validateExpenseForm(baseForm(), members);
		expect(result).toEqual({
			data: {
				description: 'Groceries',
				amountCents: 1000,
				date: new Date('2026-01-01'),
				paidByUserId: alice,
				categoryId: null,
				splits: [
					{ userId: alice, amountCents: 500 },
					{ userId: bob, amountCents: 500 }
				]
			}
		});
	});

	it('requires a description', () => {
		const result = validateExpenseForm(baseForm({ description: '  ' }), members);
		expect(result).toEqual({ error: 'Description is required' });
	});

	it('requires a valid positive amount', () => {
		const result = validateExpenseForm(baseForm({ amount: '0' }), members);
		expect(result).toEqual({ error: 'Enter a valid amount' });
	});

	it('requires a valid date', () => {
		const result = validateExpenseForm(baseForm({ date: 'not-a-date' }), members);
		expect(result).toEqual({ error: 'Invalid date' });
	});

	it('requires payer to be a member', () => {
		const result = validateExpenseForm(baseForm({ paidByUserId: 'stranger' }), members);
		expect(result).toEqual({ error: 'Select who paid' });
	});

	it('requires a valid split method', () => {
		const result = validateExpenseForm(baseForm({ splitMethod: 'bogus' }), members);
		expect(result).toEqual({ error: 'Select a split method' });
	});

	it('requires at least one included member', () => {
		const form = baseForm();
		form.set(`included-${alice}`, '');
		form.set(`included-${bob}`, '');
		const result = validateExpenseForm(form, members);
		expect(result).toEqual({ error: 'At least one member must be included in the split' });
	});

	it('resolves a real categoryId when provided', () => {
		const result = validateExpenseForm(baseForm({ categoryId: 'cat-1' }), members);
		expect(result).toMatchObject({ data: { categoryId: 'cat-1' } });
	});

	it('rejects exact splits that do not sum to the total', () => {
		const form = baseForm({ splitMethod: 'exact' });
		form.set(`exact-${alice}`, '3.00');
		form.set(`exact-${bob}`, '3.00');
		const result = validateExpenseForm(form, members);
		expect(result).toEqual({ error: 'Split amounts do not add up to the total' });
	});

	it('resolves exact splits from per-member amounts', () => {
		const form = baseForm({ splitMethod: 'exact' });
		form.set(`exact-${alice}`, '7.00');
		form.set(`exact-${bob}`, '3.00');
		const result = validateExpenseForm(form, members);
		expect(result).toMatchObject({
			data: {
				splits: [
					{ userId: alice, amountCents: 700 },
					{ userId: bob, amountCents: 300 }
				]
			}
		});
	});

	it('accounts for a frozen former-member split when checking the sum', () => {
		const form = baseForm({ splitMethod: 'exact', amount: '10.00' });
		form.set(`exact-${alice}`, '4.00');
		form.set(`exact-${bob}`, '3.00');
		const result = validateExpenseForm(form, members, 300);
		expect(result).toMatchObject({
			data: {
				amountCents: 1000,
				splits: [
					{ userId: alice, amountCents: 400 },
					{ userId: bob, amountCents: 300 }
				]
			}
		});
	});

	it('rejects current-member splits that do not cover the remaining total after a frozen split', () => {
		const form = baseForm({ splitMethod: 'exact', amount: '10.00' });
		form.set(`exact-${alice}`, '5.00');
		form.set(`exact-${bob}`, '1.00');
		const result = validateExpenseForm(form, members, 300);
		expect(result).toEqual({ error: 'Split amounts do not add up to the total' });
	});
});
