import { db } from '$lib/server/infra/db';
import { createUnitOfWork } from '$lib/server/infra/db/unit-of-work';
import { createUserRepository } from '$lib/server/infra/db/repositories/user';
import { createIdentityRepository } from '$lib/server/infra/db/repositories/identity';
import { createSessionRepository } from '$lib/server/infra/db/repositories/session';
import { createGroupRepository } from '$lib/server/infra/db/repositories/group';
import { createExpenseRepository } from '$lib/server/infra/db/repositories/expense';
import { createExpenseGroupRepository } from '$lib/server/infra/db/repositories/expense-group';
import { createSettlementRepository } from '$lib/server/infra/db/repositories/settlement';
import { createPairBalanceRepository } from '$lib/server/infra/db/repositories/pair-balance';
import { createGroupMemberRepository } from '$lib/server/infra/db/repositories/group-member';
import { createCategoryRepository } from '$lib/server/infra/db/repositories/category';
import { createNotificationRepository } from '$lib/server/infra/db/repositories/notification';
import { createExpenseReceiptRepository } from '$lib/server/infra/db/repositories/expense-receipt';
import { createGoogleOAuthProvider } from '$lib/server/infra/oauth/google';
import { createReceiptStorageBackend } from '$lib/server/infra/receipt-storage';
import { createReceiptScannerBackend } from '$lib/server/infra/receipt-scanner';
import { createPopplerPdfProcessor } from '$lib/server/infra/pdf';

import { createAuthService } from '$lib/server/app/auth';
import { createGroupBalanceService } from '$lib/server/app/group-balance';
import { createUserBalanceService } from '$lib/server/app/user-balance';
import { createExpenseService, type ExpenseRepos } from '$lib/server/app/expense';
import { createGroupService, type GroupRepos } from '$lib/server/app/group';
import { createSettlementService, type SettlementRepos } from '$lib/server/app/settlement';
import { createGroupMemberService } from '$lib/server/app/group-member';
import { createGroupInviteService, type InviteRepos } from '$lib/server/app/group-invite';
import { createNotificationService } from '$lib/server/app/notification';
import { createReceiptService } from '$lib/server/app/receipt';
import { createReceiptGcService } from '$lib/server/app/receipt-gc';
import { createScanService, type ScanConfirmRepos } from '$lib/server/app/scan';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';
import { createRemoveMemberService, type RemoveMemberRepos } from './app/remove-member';
import { env } from '$env/dynamic/private';

const userRepo = createUserRepository(db);
const identityRepo = createIdentityRepository(db);
const sessionRepo = createSessionRepository(db);
const groupRepo = createGroupRepository(db);
const expenseRepo = createExpenseRepository(db);
const expenseGroupRepo = createExpenseGroupRepository(db);
const settlementRepo = createSettlementRepository(db);
const pairBalanceRepo = createPairBalanceRepository(db);
const groupMemberRepo = createGroupMemberRepository(db);
const categoryRepo = createCategoryRepository(db);
const notificationRepo = createNotificationRepository(db);
const receiptRepo = createExpenseReceiptRepository(db);
const receiptStorageBackend = createReceiptStorageBackend();
const pdfProcessor = createPopplerPdfProcessor();
const receiptScannerBackend = createReceiptScannerBackend(undefined, { pdfProcessor });
export const scannerEnabled = receiptScannerBackend !== null;

const googleOAuthProvider = createGoogleOAuthProvider();
const oauthProviders: Record<string, IOAuthProvider> = {
	[googleOAuthProvider.provider]: googleOAuthProvider
};

const expenseUnitOfWork = createUnitOfWork<ExpenseRepos>((tx) => ({
	expenseRepo: createExpenseRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx),
	expenseGroupRepo: createExpenseGroupRepository(tx)
}));

const settlementUnitOfWork = createUnitOfWork<SettlementRepos>((tx) => ({
	settlementRepo: createSettlementRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx)
}));

const groupUnitOfWork = createUnitOfWork<GroupRepos>((tx) => ({
	groupRepo: createGroupRepository(tx),
	groupMemberRepo: createGroupMemberRepository(tx)
}));

const inviteUnitOfWork = createUnitOfWork<InviteRepos>((tx) => ({
	userRepo: createUserRepository(tx),
	groupMemberRepo: createGroupMemberRepository(tx)
}));

const removeMemberUnitOfWork = createUnitOfWork<RemoveMemberRepos>((tx) => ({
	groupMemberRepo: createGroupMemberRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx),
	groupRepo: createGroupRepository(tx)
}));

const scanConfirmUnitOfWork = createUnitOfWork<ScanConfirmRepos>((tx) => ({
	expenseRepo: createExpenseRepository(tx),
	pairBalanceRepo: createPairBalanceRepository(tx),
	expenseGroupRepo: createExpenseGroupRepository(tx),
	receiptRepo: createExpenseReceiptRepository(tx)
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

export const expenseService = createExpenseService({
	uow: expenseUnitOfWork,
	expenseRepo,
	groupRepo,
	groupMemberRepo,
	notificationRepo
});

export const settlementService = createSettlementService({
	uow: settlementUnitOfWork,
	groupRepo,
	groupMemberRepo,
	notificationRepo
});

export const groupMemberService = createGroupMemberService({
	groupMemberRepo,
	identityRepo,
	pairBalanceRepo
});

export const groupInviteService = createGroupInviteService({ uow: inviteUnitOfWork });

export const removeMemberService = createRemoveMemberService({
	uow: removeMemberUnitOfWork,
	notificationRepo
});

export const groupService = createGroupService({
	uow: groupUnitOfWork,
	groupRepo,
	pairBalanceRepo
});

export const notificationService = createNotificationService({ notificationRepo });

export const receiptService = createReceiptService({
	receiptRepo,
	storageBackend: receiptStorageBackend,
	expenseRepo,
	expenseGroupRepo,
	groupMemberRepo
});

export const scanService =
	receiptScannerBackend !== null
		? createScanService({
				storageBackend: receiptStorageBackend,
				scanner: receiptScannerBackend,
				groupMemberRepo,
				uow: scanConfirmUnitOfWork
			})
		: null;

export const receiptGcService = createReceiptGcService({
	receiptRepo,
	storageBackend: receiptStorageBackend
});

const gcSecret = env.GC_SECRET;
if (!gcSecret) {
	console.error('GC_SECRET is not set');
	throw new Error('GC_SECRET is not set');
}
const resolvedGcSecret: string = gcSecret;
export { resolvedGcSecret as gcSecret };

export {
	groupRepo,
	groupMemberRepo,
	categoryRepo,
	expenseRepo,
	pairBalanceRepo,
	notificationRepo,
	receiptRepo,
	receiptScannerBackend
};
