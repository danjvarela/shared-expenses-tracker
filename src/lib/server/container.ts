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
import { createFileStorageBackend } from '$lib/server/infra/file-storage';
import { createReceiptScannerBackend } from '$lib/server/infra/receipt-scanner';
import { createPopplerPdfProcessor } from '$lib/server/infra/pdf';
import { createReceiptNormalizer } from '$lib/server/infra/receipt-normalizer';
import { createAvatarNormalizer } from '$lib/server/infra/avatar-normalizer';

import { createAuthService } from '$lib/server/app/auth';
import { createGroupBalanceService } from '$lib/server/app/group-balance';
import { createUserBalanceService } from '$lib/server/app/user-balance';
import { createExpenseService, type ExpenseRepos } from '$lib/server/app/expense';
import { createGroupService, type GroupRepos } from '$lib/server/app/group';
import { createCategoryService, type CategoryRepos } from '$lib/server/app/category';
import { createSettlementService, type SettlementRepos } from '$lib/server/app/settlement';
import { createGroupMemberService } from '$lib/server/app/group-member';
import { createGroupInviteService, type InviteRepos } from '$lib/server/app/group-invite';
import { createNotificationService } from '$lib/server/app/notification';
import { createUserService, type AnonymizeRepos } from '$lib/server/app/user';
import { createReceiptService } from '$lib/server/app/receipt';
import { createReceiptGcService } from '$lib/server/app/receipt-gc';
import { createAvatarGcService } from '$lib/server/app/avatar-gc';
import { createScanService, type ScanConfirmRepos } from '$lib/server/app/scan';
import type { IOAuthProvider } from '$lib/server/app/interfaces/oauth-provider';
import { createRemoveMemberService, type RemoveMemberRepos } from './app/remove-member';
import { createLogger } from '$lib/server/infra/logger';
import type { LogLevel } from '$lib/server/app/interfaces/logger';
import { env } from '$env/dynamic/private';

function resolveLogLevel(raw: string | undefined): LogLevel {
	return raw === 'debug' || raw === 'info' || raw === 'warn' || raw === 'error' ? raw : 'info';
}

const logger = createLogger({ level: resolveLogLevel(env.LOG_LEVEL) });

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
const receiptStorageBackend = createFileStorageBackend({
	backend: env.RECEIPT_STORAGE_BACKEND ?? 'fs',
	fsDir: env.RECEIPT_STORAGE_FS_DIR ?? './uploads',
	logger: logger.child({ component: 'receipt-storage' })
});
const avatarStorageBackend = createFileStorageBackend({
	backend: env.AVATAR_STORAGE_BACKEND ?? 'fs',
	fsDir: env.AVATAR_STORAGE_FS_DIR ?? './uploads-avatars',
	logger: logger.child({ component: 'avatar-storage' })
});
const pdfProcessor = createPopplerPdfProcessor({ logger: logger.child({ component: 'pdf' }) });
const receiptNormalizer = createReceiptNormalizer({
	pdfProcessor,
	logger: logger.child({ component: 'normalizer' })
});
const avatarNormalizer = createAvatarNormalizer({
	logger: logger.child({ component: 'avatar-normalizer' })
});
const receiptScannerBackend = createReceiptScannerBackend(undefined, {
	pdfProcessor,
	logger: logger.child({ component: 'scanner' })
});
export const scannerEnabled = receiptScannerBackend !== null;

const googleOAuthProvider = createGoogleOAuthProvider({
	logger: logger.child({ component: 'oauth' })
});
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
	groupMemberRepo: createGroupMemberRepository(tx),
	categoryRepo: createCategoryRepository(tx)
}));

const categoryUnitOfWork = createUnitOfWork<CategoryRepos>((tx) => ({
	categoryRepo: createCategoryRepository(tx)
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

const anonymizeUnitOfWork = createUnitOfWork<AnonymizeRepos>((tx) => ({
	userRepo: createUserRepository(tx),
	identityRepo: createIdentityRepository(tx),
	sessionRepo: createSessionRepository(tx),
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

export const expenseService = createExpenseService({
	uow: expenseUnitOfWork,
	expenseRepo,
	groupRepo,
	groupMemberRepo,
	notificationRepo,
	logger: logger.child({ component: 'expense' })
});

export const settlementService = createSettlementService({
	uow: settlementUnitOfWork,
	groupRepo,
	groupMemberRepo,
	notificationRepo,
	logger: logger.child({ component: 'settlement' })
});

export const groupMemberService = createGroupMemberService({
	groupMemberRepo,
	identityRepo,
	pairBalanceRepo
});

export const groupInviteService = createGroupInviteService({ uow: inviteUnitOfWork });

export const removeMemberService = createRemoveMemberService({
	uow: removeMemberUnitOfWork,
	notificationRepo,
	logger: logger.child({ component: 'remove-member' })
});

export const groupService = createGroupService({
	uow: groupUnitOfWork,
	groupRepo,
	pairBalanceRepo
});

export const categoryService = createCategoryService({ uow: categoryUnitOfWork, categoryRepo });

export const notificationService = createNotificationService({ notificationRepo });

export const userService = createUserService({
	userRepo,
	uow: anonymizeUnitOfWork,
	storageBackend: avatarStorageBackend,
	normalizer: avatarNormalizer,
	logger: logger.child({ component: 'user' })
});

export const receiptService = createReceiptService({
	receiptRepo,
	storageBackend: receiptStorageBackend,
	normalizer: receiptNormalizer,
	expenseRepo,
	expenseGroupRepo,
	groupMemberRepo,
	logger: logger.child({ component: 'receipt' })
});

export const scanService =
	receiptScannerBackend !== null
		? createScanService({
				storageBackend: receiptStorageBackend,
				normalizer: receiptNormalizer,
				scanner: receiptScannerBackend,
				groupMemberRepo,
				uow: scanConfirmUnitOfWork,
				logger: logger.child({ component: 'scan' })
			})
		: null;

export const receiptGcService = createReceiptGcService({
	receiptRepo,
	storageBackend: receiptStorageBackend,
	logger: logger.child({ component: 'receipt-gc' })
});

export const avatarGcService = createAvatarGcService({
	userRepo,
	storageBackend: avatarStorageBackend,
	logger: logger.child({ component: 'avatar-gc' })
});

const gcSecret = env.GC_SECRET;
if (!gcSecret) {
	logger.error('GC_SECRET is not set');
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
	receiptScannerBackend,
	avatarStorageBackend,
	userRepo
};
