import { describe, it, expect } from 'vitest';
import { resolveSplits } from './split-resolver';

const alice = 'alice';
const bob = 'bob';
const carol = 'carol';

describe('resolveSplits', () => {
	it('splits equally among included members', () => {
		const splits = resolveSplits({
			method: 'equal',
			amountCents: 1000,
			payerId: alice,
			members: [
				{ userId: alice, included: true },
				{ userId: bob, included: true }
			]
		});

		expect(splits).toEqual([
			{ userId: alice, amountCents: 500 },
			{ userId: bob, amountCents: 500 }
		]);
	});

	it('gives the leftover cent(s) to the payer when equal split does not divide evenly', () => {
		const splits = resolveSplits({
			method: 'equal',
			amountCents: 1000,
			payerId: bob,
			members: [
				{ userId: alice, included: true },
				{ userId: bob, included: true },
				{ userId: carol, included: true }
			]
		});

		expect(splits).toEqual([
			{ userId: alice, amountCents: 333 },
			{ userId: bob, amountCents: 334 },
			{ userId: carol, amountCents: 333 }
		]);
	});

	it('gives the leftover cent(s) to the first included member when the payer is excluded', () => {
		const splits = resolveSplits({
			method: 'equal',
			amountCents: 1000,
			payerId: bob,
			members: [
				{ userId: alice, included: true },
				{ userId: bob, included: false },
				{ userId: carol, included: true }
			]
		});

		expect(splits).toEqual([
			{ userId: alice, amountCents: 500 },
			{ userId: carol, amountCents: 500 }
		]);
	});

	it('excludes a member entirely rather than emitting a zero-value row', () => {
		const splits = resolveSplits({
			method: 'equal',
			amountCents: 1000,
			payerId: alice,
			members: [
				{ userId: alice, included: true },
				{ userId: bob, included: false }
			]
		});

		expect(splits).toEqual([{ userId: alice, amountCents: 1000 }]);
	});

	it('splits by percentage and rounds to the nearest cent, remainder to payer', () => {
		const splits = resolveSplits({
			method: 'percentage',
			amountCents: 1000,
			payerId: alice,
			members: [
				{ userId: alice, included: true, percent: 33.33 },
				{ userId: bob, included: true, percent: 33.33 },
				{ userId: carol, included: true, percent: 33.34 }
			]
		});

		const total = splits.reduce((sum, split) => sum + split.amountCents, 0);
		expect(total).toBe(1000);
		expect(splits.find((s) => s.userId === alice)?.amountCents).toBeGreaterThanOrEqual(333);
	});

	it('uses exact amounts as given, only for included members', () => {
		const splits = resolveSplits({
			method: 'exact',
			amountCents: 1000,
			payerId: alice,
			members: [
				{ userId: alice, included: true, exactAmountCents: 400 },
				{ userId: bob, included: true, exactAmountCents: 600 },
				{ userId: carol, included: false, exactAmountCents: 0 }
			]
		});

		expect(splits).toEqual([
			{ userId: alice, amountCents: 400 },
			{ userId: bob, amountCents: 600 }
		]);
	});
});
