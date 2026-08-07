import { describe, it, expect } from 'vitest';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type {
	IPairBalanceRepository,
	UserDebt
} from '$lib/server/app/interfaces/repositories/pair-balance';
import { createUserBalanceService } from './user-balance';

const alice = 'alice';

function fakeGroupRepo(): IGroupRepository {
	return {
		async getAll() {
			return [];
		},
		async getById() {
			return null;
		},
		async create() {
			throw new Error('not implemented');
		},
		async update() {
			throw new Error('not implemented');
		}
	};
}

function fakePairBalanceRepo(debts: Array<UserDebt>): IPairBalanceRepository {
	return {
		async getForPair() {
			return null;
		},
		async replaceForPair() {},
		async getAllForGroup() {
			return [];
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async getDebtsForUser() {
			return debts;
		},
		async replaceAllForGroup() {}
	};
}

describe('createUserBalanceService.getUserDebts', () => {
	it('sorts debts largest amount first', async () => {
		const debts: Array<UserDebt> = [
			{
				groupId: 'group-1',
				groupName: 'Trip',
				groupCurrencyCode: 'USD',
				groupAvatarIcon: null,
				counterpartyId: 'bob',
				counterpartyName: 'Bob',
				amountCents: 500
			},
			{
				groupId: 'group-2',
				groupName: 'Rent',
				groupCurrencyCode: 'PHP',
				groupAvatarIcon: 'Home',
				counterpartyId: 'carol',
				counterpartyName: 'Carol',
				amountCents: 1500
			}
		];

		const service = createUserBalanceService({
			groupRepo: fakeGroupRepo(),
			pairBalanceRepo: fakePairBalanceRepo(debts)
		});

		expect(await service.getUserDebts(alice)).toEqual([debts[1], debts[0]]);
	});
});
