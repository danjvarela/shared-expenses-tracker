import { db } from '$lib/server/infra/db';
import { createUnitOfWork } from '$lib/server/infra/db/unit-of-work';
import { createUserRepository } from '$lib/server/infra/db/repositories/user';
import { createIdentityRepository } from '$lib/server/infra/db/repositories/identity';
import { createSessionRepository } from '$lib/server/infra/db/repositories/session';
import { createGroupRepository } from '$lib/server/infra/db/repositories/group';
import { createExpenseRepository } from '$lib/server/infra/db/repositories/expense';
import { createSettlementRepository } from '$lib/server/infra/db/repositories/settlement';
import { createPairBalanceRepository } from '$lib/server/infra/db/repositories/pair-balance';
import { createGroupMemberRepository } from '$lib/server/infra/db/repositories/group-member';
import { createCategoryRepository } from '$lib/server/infra/db/repositories/category';
import { createGoogleOAuthProvider } from '$lib/server/infra/oauth/google';

import { createAuthService } from '$lib/server/app/auth';
import { createGroupBalanceService } from '$lib/server/app/group-balance';
import { createUserBalanceService } from '$lib/server/app/user-balance';
import { createExpenseService, type ExpenseRepos } from '$lib/server/app/expense';
import { createGroupService, type GroupRepos } from '$lib/server/app/group';
import { createSettlementService, type SettlementRepos } from '$lib/server/app/settlement';
import { createGroupMemberService } from '$lib/server/app/group-member';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';

const userRepo = createUserRepository(db);
const identityRepo = createIdentityRepository(db);
const sessionRepo = createSessionRepository(db);
const groupRepo = createGroupRepository(db);
const expenseRepo = createExpenseRepository(db);
const settlementRepo = createSettlementRepository(db);
const pairBalanceRepo = createPairBalanceRepository(db);
const groupMemberRepo = createGroupMemberRepository(db);
const categoryRepo = createCategoryRepository(db);

const googleOAuthProvider = createGoogleOAuthProvider();
const oauthProviders: Record<string, IOAuthProvider> = {
	[googleOAuthProvider.provider]: googleOAuthProvider
};

const expenseUnitOfWork = createUnitOfWork<ExpenseRepos>((tx) => ({
	expenseRepo: createExpenseRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx)
}));

const settlementUnitOfWork = createUnitOfWork<SettlementRepos>((tx) => ({
	settlementRepo: createSettlementRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx)
}));

const groupUnitOfWork = createUnitOfWork<GroupRepos>((tx) => ({
	groupRepo: createGroupRepository(tx),
	groupMemberRepo: createGroupMemberRepository(tx)
}));

export const authService = createAuthService({
	userRepo,
	identityRepo,
	sessionRepo,
	oauthProviders
});

export { settlementRepo };

export const groupBalanceService = createGroupBalanceService({
	expenseRepo,
	settlementRepo,
	pairBalanceRepo
});

export const userBalanceService = createUserBalanceService({ groupRepo, pairBalanceRepo });

export const expenseService = createExpenseService({ uow: expenseUnitOfWork, expenseRepo });

export const settlementService = createSettlementService({ uow: settlementUnitOfWork });

export const groupMemberService = createGroupMemberService({ groupMemberRepo });

export const groupService = createGroupService({
	uow: groupUnitOfWork,
	groupRepo,
	pairBalanceRepo
});

export { groupRepo, groupMemberRepo, categoryRepo, expenseRepo, pairBalanceRepo };
