import { createClient } from '@libsql/client';
import { drizzle } from 'drizzle-orm/libsql';
import * as schema from '../src/lib/server/infra/db/schema';

const WIPE_FLAG = '--yes-i-know';

if (!process.argv.includes(WIPE_FLAG)) {
	console.error(`Refusing to run: this wipes all tables. Pass ${WIPE_FLAG} to confirm.`);
	process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is not set');

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
	await db.delete(schema.user);

	const [alice, bob, carol] = await db
		.insert(schema.user)
		.values([
			{ displayName: 'Dan', email: 'vareladanmarj@gmail.com' },
			{ displayName: 'Nelie', email: 'neliejoycabanillas26@gmail.com' },
			{ displayName: 'Carol', email: 'carol@example.com' }
		])
		.returning();

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

	const [apartment, tripToOsaka, condo] = await db
		.insert(schema.group)
		.values([{ name: 'Apartment 4B' }, { name: 'Trip to Osaka' }, { name: 'Condo 12' }])
		.returning();

	const defaultCategories = [food, rent, transport, utilities, fun];
	await db.insert(schema.groupCategory).values(
		[apartment, tripToOsaka, condo].flatMap((group) =>
			defaultCategories.map((category) => ({ groupId: group.id, categoryId: category.id }))
		)
	);

	await db.insert(schema.groupMember).values([
		{ groupId: apartment.id, userId: alice.id },
		{ groupId: apartment.id, userId: bob.id },
		{ groupId: tripToOsaka.id, userId: alice.id },
		{ groupId: tripToOsaka.id, userId: bob.id },
		{ groupId: condo.id, userId: alice.id },
		{ groupId: condo.id, userId: bob.id },
		{ groupId: condo.id, userId: carol.id }
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

	const apartmentExpenses = await Promise.all([
		insertExpense({
			groupId: apartment.id,
			paidByUserId: alice.id,
			categoryId: rent.id,
			description: 'August rent',
			amountCents: 180000,
			date: new Date('2025-08-01')
		}),
		insertExpense({
			groupId: apartment.id,
			paidByUserId: bob.id,
			categoryId: utilities.id,
			description: 'Electric bill',
			amountCents: 6400,
			date: new Date('2025-08-05')
		}),
		insertExpense({
			groupId: apartment.id,
			paidByUserId: alice.id,
			categoryId: food.id,
			description: 'Costco run',
			amountCents: 11250,
			date: new Date('2025-08-10')
		})
	]);

	const osakaExpenses = await Promise.all([
		insertExpense({
			groupId: tripToOsaka.id,
			paidByUserId: bob.id,
			categoryId: transport.id,
			description: 'Airport taxi',
			amountCents: 4500,
			date: new Date('2025-09-01')
		}),
		insertExpense({
			groupId: tripToOsaka.id,
			paidByUserId: bob.id,
			categoryId: food.id,
			description: 'Ramen night',
			amountCents: 9000,
			date: new Date('2025-09-02')
		}),
		insertExpense({
			groupId: tripToOsaka.id,
			paidByUserId: alice.id,
			categoryId: fun.id,
			description: 'Karaoke',
			amountCents: 6000,
			date: new Date('2025-09-02')
		})
	]);

	const [rentExpense, electricExpense, costcoExpense] = apartmentExpenses;
	const [taxiExpense, ramenExpense, karaokeExpense] = osakaExpenses;

	await db.insert(schema.expenseSplit).values([
		// August rent, split equally between Alice and Bob
		{ expenseId: rentExpense.id, userId: alice.id, amountCents: 90000 },
		{ expenseId: rentExpense.id, userId: bob.id, amountCents: 90000 },
		// Electric bill, split equally
		{ expenseId: electricExpense.id, userId: alice.id, amountCents: 3200 },
		{ expenseId: electricExpense.id, userId: bob.id, amountCents: 3200 },
		// Costco run, split equally
		{ expenseId: costcoExpense.id, userId: alice.id, amountCents: 5625 },
		{ expenseId: costcoExpense.id, userId: bob.id, amountCents: 5625 },
		// Airport taxi, split equally
		{ expenseId: taxiExpense.id, userId: alice.id, amountCents: 2250 },
		{ expenseId: taxiExpense.id, userId: bob.id, amountCents: 2250 },
		// Ramen night, split equally
		{ expenseId: ramenExpense.id, userId: alice.id, amountCents: 4500 },
		{ expenseId: ramenExpense.id, userId: bob.id, amountCents: 4500 },
		// Karaoke, split equally
		{ expenseId: karaokeExpense.id, userId: alice.id, amountCents: 3000 },
		{ expenseId: karaokeExpense.id, userId: bob.id, amountCents: 3000 }
	]);

	const [settlement] = await db
		.insert(schema.settlement)
		.values([{ groupId: apartment.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 5000 }])
		.returning();

	await db.insert(schema.notification).values([
		{
			userId: alice.id,
			groupId: apartment.id,
			type: 'expense_created',
			expenseId: electricExpense.id,
			settlementId: null,
			message: 'Nelie added Electric bill (₱64.00)'
		},
		{
			userId: alice.id,
			groupId: tripToOsaka.id,
			type: 'expense_created',
			expenseId: taxiExpense.id,
			settlementId: null,
			message: 'Nelie added Airport taxi (₱45.00)'
		},
		{
			userId: alice.id,
			groupId: apartment.id,
			type: 'settlement_created',
			expenseId: null,
			settlementId: settlement.id,
			message: 'Nelie settled up ₱50.00'
		},
		{
			userId: alice.id,
			groupId: condo.id,
			type: 'member_removed',
			expenseId: null,
			settlementId: null,
			message: 'Nelie removed Carol from Condo 12'
		}
	]);

	console.log('Seeded database.');
	client.close();
}

main();
