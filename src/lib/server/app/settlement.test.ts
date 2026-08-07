import { describe, it, expect } from 'vitest';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import { createSettlementService, type SettlementRepos } from './settlement';

const alice = 'alice';
const bob = 'bob';
const groupId = 'group-1';

function fakeUnitOfWork(repos: SettlementRepos): IUnitOfWork<SettlementRepos> {
	return {
		async run(fn) {
			return fn(repos);
		}
	};
}

function fakeSettlementRepo(): ISettlementRepository {
	const rows: Array<{
		id: string;
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
		createdAt: Date;
	}> = [];

	return {
		async create(input) {
			const row = { id: `settlement-${rows.length}`, createdAt: new Date(), ...input };
			rows.push(row);
			return row;
		},
		async getAllForGroup(groupId) {
			return rows.filter((row) => row.groupId === groupId);
		},
		async getById(id) {
			return rows.find((row) => row.id === id);
		}
	};
}

function fakePairBalanceRepo(): IPairBalanceRepository & {
	deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}>;
} {
	const rows = new Map<string, { fromUserId: string; toUserId: string; amountCents: number }>();
	const deltasApplied: Array<{
		groupId: string;
		fromUserId: string;
		toUserId: string;
		amountCents: number;
	}> = [];
	const key = (a: string, b: string) => [a, b].sort().join('|');

	return {
		deltasApplied,
		async getForPair(_groupId, userA, userB) {
			return rows.get(key(userA, userB)) ?? null;
		},
		async replaceForPair(groupId, userA, userB, next) {
			if (next) {
				rows.set(key(userA, userB), next);
				deltasApplied.push({ groupId, ...next });
			} else {
				rows.delete(key(userA, userB));
			}
		},
		async getAllForGroup() {
			return [];
		},
		async getNetForUserInGroups() {
			return new Map();
		},
		async getDebtsForUser() {
			return [];
		},
		async getDebtsForUserInGroup() {
			return [];
		},
		async replaceAllForGroup() {}
	};
}

describe('createSettlementService', () => {
	it('creates a settlement and reduces the payer debt within the unit of work', async () => {
		const settlementRepo = fakeSettlementRepo();
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createSettlementService({
			uow: fakeUnitOfWork({ settlementRepo, pairBalanceRepo })
		});

		const created = await service.createSettlement({
			groupId,
			fromUserId: bob,
			toUserId: alice,
			amountCents: 300
		});

		expect(created.id).toBeDefined();
		expect(pairBalanceRepo.deltasApplied).toEqual([
			{ groupId, fromUserId: alice, toUserId: bob, amountCents: 300 }
		]);
	});
});
