import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/server/infra/db/schema';
import { hashPassword } from '../src/lib/server/infra/crypto';
import { DEMO_ACCOUNTS, DEMO_PASSWORD } from '../src/lib/server/infra/demo-credentials';

const WIPE_FLAG = '--yes-i-know';

if (!process.argv.includes(WIPE_FLAG)) {
	console.error(`Refusing to run: this wipes all tables. Pass ${WIPE_FLAG} to confirm.`);
	process.exit(1);
}

const databaseUrl = process.env.DEMO_DATABASE_URL;
if (!databaseUrl) throw new Error('DEMO_DATABASE_URL is not set');

const client = createClient({ url: databaseUrl });
const db = drizzle(client, { schema, casing: 'snake_case' });

async function main() {
	await db.delete(schema.notification);
	await db.delete(schema.expenseSplit);
	await db.delete(schema.settlement);
	await db.delete(schema.expense);
	await db.delete(schema.groupMember);
	await db.delete(schema.groupCategory);
	await db.delete(schema.category);
	await db.delete(schema.group);
	await db.delete(schema.identity);
	await db.delete(schema.user);

	const users = await db
		.insert(schema.user)
		.values(DEMO_ACCOUNTS.map((account) => ({ displayName: account.displayName, email: account.email })))
		.returning();

	const passwordHash = await hashPassword(DEMO_PASSWORD);
	await db.insert(schema.identity).values(
		users.map((user) => ({
			userId: user.id,
			provider: 'password',
			providerSubject: user.email,
			passwordHash
		}))
	);

	const [ana, ben, chloe] = users;

	const [food, rent, transport, utilities, fun] = await db
		.insert(schema.category)
		.values([
			{ name: 'Food', icon: '🍔' },
			{ name: 'Rent', icon: '🏠' },
			{ name: 'Transport', icon: '🚗' },
			{ name: 'Utilities', icon: '💡' },
			{ name: 'Fun', icon: '🎉' }
		])
		.returning();

	const [apartment] = await db.insert(schema.group).values([{ name: 'Shared Apartment' }]).returning();

	const defaultCategories = [food, rent, transport, utilities, fun];
	await db
		.insert(schema.groupCategory)
		.values(defaultCategories.map((category) => ({ groupId: apartment.id, categoryId: category.id })));

	await db.insert(schema.groupMember).values([
		{ groupId: apartment.id, userId: ana.id },
		{ groupId: apartment.id, userId: ben.id },
		{ groupId: apartment.id, userId: chloe.id }
	]);

	async function insertExpense(input: {
		groupId: string;
		paidByUserId: string;
		categoryId: string;
		description: string;
		amountCents: number;
		date: Date;
	}) {
		const [group] = await db
			.insert(schema.expenseGroup)
			.values({ groupId: input.groupId })
			.returning();
		const [expense] = await db
			.insert(schema.expense)
			.values({ ...input, expenseGroupId: group.id })
			.returning();
		return expense;
	}

	const [rentExpense, electricExpense, groceriesExpense] = await Promise.all([
		insertExpense({
			groupId: apartment.id,
			paidByUserId: ana.id,
			categoryId: rent.id,
			description: 'September rent',
			amountCents: 150000,
			date: new Date('2025-09-01')
		}),
		insertExpense({
			groupId: apartment.id,
			paidByUserId: ben.id,
			categoryId: utilities.id,
			description: 'Electric bill',
			amountCents: 7200,
			date: new Date('2025-09-05')
		}),
		insertExpense({
			groupId: apartment.id,
			paidByUserId: chloe.id,
			categoryId: food.id,
			description: 'Grocery run',
			amountCents: 8600,
			date: new Date('2025-09-08')
		})
	]);

	await db.insert(schema.expenseSplit).values([
		{ expenseId: rentExpense.id, userId: ana.id, amountCents: 50000 },
		{ expenseId: rentExpense.id, userId: ben.id, amountCents: 50000 },
		{ expenseId: rentExpense.id, userId: chloe.id, amountCents: 50000 },
		{ expenseId: electricExpense.id, userId: ana.id, amountCents: 2400 },
		{ expenseId: electricExpense.id, userId: ben.id, amountCents: 2400 },
		{ expenseId: electricExpense.id, userId: chloe.id, amountCents: 2400 },
		{ expenseId: groceriesExpense.id, userId: ana.id, amountCents: 2867 },
		{ expenseId: groceriesExpense.id, userId: ben.id, amountCents: 2867 },
		{ expenseId: groceriesExpense.id, userId: chloe.id, amountCents: 2866 }
	]);

	console.log('Seeded demo database.');
	client.close();
}

main();
