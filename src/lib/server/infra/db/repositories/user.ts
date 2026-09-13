import type { IUserRepository } from '$lib/server/app/interfaces/repositories/user';
import type { Database } from '$lib/server/infra/db/types';
import { user } from '$lib/server/infra/db/schema/user';
import { eq, isNotNull } from 'drizzle-orm';

function normalizeEmail(email: string): string {
	return email.trim().toLowerCase();
}

const findByEmail =
	(db: Database): IUserRepository['findByEmail'] =>
	async (email) => {
		const normalizedEmail = normalizeEmail(email);
		const rows = await db.select().from(user).where(eq(user.email, normalizedEmail));
		return rows[0] ?? null;
	};

const getById =
	(db: Database): IUserRepository['getById'] =>
	async (userId) => {
		const rows = await db.select().from(user).where(eq(user.id, userId));
		return rows[0] ?? null;
	};

const create =
	(db: Database): IUserRepository['create'] =>
	async (input) => {
		const normalizedEmail = normalizeEmail(input.email);

		// when creating from invite, displayName is email so we normalize it first
		const resolvedDisplayName = input.fromInvite
			? normalizeEmail(input.displayName)
			: input.displayName;

		const [row] = await db
			.insert(user)
			.values({ displayName: resolvedDisplayName, email: normalizedEmail })
			.returning();
		return row;
	};

const updateDisplayName =
	(db: Database): IUserRepository['updateDisplayName'] =>
	async (userId, displayName) => {
		await db.update(user).set({ displayName }).where(eq(user.id, userId));
	};

const updateAvatar =
	(db: Database): IUserRepository['updateAvatar'] =>
	async (userId, avatar) => {
		await db
			.update(user)
			.set({ avatarStorageKey: avatar.avatarStorageKey, avatarMime: avatar.avatarMime })
			.where(eq(user.id, userId));
	};

const getAllAvatarStorageKeys =
	(db: Database): IUserRepository['getAllAvatarStorageKeys'] =>
	async () => {
		const rows = await db
			.select({ storageKey: user.avatarStorageKey })
			.from(user)
			.where(isNotNull(user.avatarStorageKey));
		return rows.map((row) => row.storageKey).filter((key): key is string => key !== null);
	};

const anonymize =
	(db: Database): IUserRepository['anonymize'] =>
	async (userId) => {
		await db
			.update(user)
			.set({
				email: null,
				displayName: 'Deleted user',
				deletedAt: new Date(),
				avatarStorageKey: null,
				avatarMime: null
			})
			.where(eq(user.id, userId));
	};

export function createUserRepository(db: Database): IUserRepository {
	return {
		findByEmail: findByEmail(db),
		getById: getById(db),
		create: create(db),
		updateDisplayName: updateDisplayName(db),
		updateAvatar: updateAvatar(db),
		getAllAvatarStorageKeys: getAllAvatarStorageKeys(db),
		anonymize: anonymize(db)
	};
}
