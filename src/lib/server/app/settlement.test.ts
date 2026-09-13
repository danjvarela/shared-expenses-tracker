import { describe, it, expect } from 'vitest';
import type { IUnitOfWork } from '$lib/server/app/interfaces/unit-of-work';
import type { ISettlementRepository } from '$lib/server/app/interfaces/repositories/settlement';
import type { IPairBalanceRepository } from '$lib/server/app/interfaces/repositories/pair-balance';
import type { IGroupRepository } from '$lib/server/app/interfaces/repositories/group';
import type { IGroupMemberRepository } from '$lib/server/app/interfaces/repositories/group-member';
import type {
	INotificationRepository,
	NotificationCreateInput
} from '$lib/server/app/interfaces/repositories/notification';
import type { Notification } from '$lib/server/domain/notification';
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
			const row = rows.find((r) => r.id === id);
			if (!row) return undefined;
			return { ...row, fromUserName: row.fromUserId, toUserName: row.toUserId };
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
		async hasBalanceForUserInGroup() {
			return false;
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

function fakeGroupRepo(): IGroupRepository {
	return {
		async getAll() {
			return [];
		},
		async getById(id) {
			return { id, name: 'Trip', currencyCode: 'USD', avatarIcon: null, createdAt: new Date() };
		},
		async create(input) {
			return { id: 'group-x', createdAt: new Date(), ...input };
		},
		async update(id, input) {
			return { id, createdAt: new Date(), ...input };
		},
		async delete() {}
	};
}

function fakeGroupMemberRepo(): IGroupMemberRepository {
	return {
		async getAllForGroupWithUser() {
			return [
				{ userId: alice, displayName: 'Alice', defaultSplitPercent: null, avatarStorageKey: null },
				{ userId: bob, displayName: 'Bob', defaultSplitPercent: null, avatarStorageKey: null }
			];
		},
		async create() {},
		async updateDefaultSplitPercents() {},
		async isMember() {
			return true;
		},
		async countByGroup() {
			return 2;
		},
		async remove() {},
		async getGroupIdsForUser() {
			return [];
		}
	};
}

function fakeNotificationRepo(): INotificationRepository & {
	created: Array<NotificationCreateInput>;
} {
	const created: Array<NotificationCreateInput> = [];
	return {
		created,
		async create(input) {
			created.push(input);
			return {
				id: `notification-${created.length}`,
				readAt: null,
				createdAt: new Date(),
				...input
			} as Notification;
		},
		async listForUser() {
			return [];
		},
		async getUnreadCountForUser() {
			return 0;
		},
		async markRead() {},
		async markAllReadForUser() {}
	};
}

describe('createSettlementService', () => {
	it('creates a settlement and reduces the payer debt within the unit of work', async () => {
		const settlementRepo = fakeSettlementRepo();
		const pairBalanceRepo = fakePairBalanceRepo();
		const service = createSettlementService({
			uow: fakeUnitOfWork({ settlementRepo, pairBalanceRepo }),
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo(),
			notificationRepo: fakeNotificationRepo()
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

	it('notifies only the counterparty, not the actor', async () => {
		const settlementRepo = fakeSettlementRepo();
		const pairBalanceRepo = fakePairBalanceRepo();
		const notificationRepo = fakeNotificationRepo();
		const service = createSettlementService({
			uow: fakeUnitOfWork({ settlementRepo, pairBalanceRepo }),
			groupRepo: fakeGroupRepo(),
			groupMemberRepo: fakeGroupMemberRepo(),
			notificationRepo
		});

		const created = await service.createSettlement({
			groupId,
			fromUserId: bob,
			toUserId: alice,
			amountCents: 300
		});

		expect(notificationRepo.created).toEqual([
			{
				userId: alice,
				groupId,
				type: 'settlement_created',
				expenseId: null,
				settlementId: created.id,
				message: 'Bob settled $3.00 with you'
			}
		]);
	});

	it('does not throw if notification creation fails', async () => {
		const settlementRepo = fakeSettlementRepo();
		const pairBalanceRepo = fakePairBalanceRepo();
		const groupRepo = fakeGroupRepo();
		groupRepo.getById = async () => null;
		const service = createSettlementService({
			uow: fakeUnitOfWork({ settlementRepo, pairBalanceRepo }),
			groupRepo,
			groupMemberRepo: fakeGroupMemberRepo(),
			notificationRepo: fakeNotificationRepo()
		});

		await expect(
			service.createSettlement({ groupId, fromUserId: bob, toUserId: alice, amountCents: 300 })
		).resolves.toBeDefined();
	});
});
