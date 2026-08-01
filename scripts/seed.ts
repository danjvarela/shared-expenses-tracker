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
	await db.delete(schema.expenseSplit);
	await db.delete(schema.settlement);
	await db.delete(schema.expense);
	await db.delete(schema.groupMember);
	await db.delete(schema.category);
	await db.delete(schema.group);
	await db.delete(schema.user);

	const [alice, bob, carol] = await db
		.insert(schema.user)
		.values([
			{ displayName: 'Alice', email: 'alice@example.com' },
			{ displayName: 'Bob', email: 'bob@example.com' },
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

	const [apartment, tripToOsaka] = await db
		.insert(schema.group)
		.values([{ name: 'Apartment 4B' }, { name: 'Trip to Osaka' }])
		.returning();

	await db.insert(schema.groupMember).values([
		{ groupId: apartment.id, userId: alice.id },
		{ groupId: apartment.id, userId: bob.id },
		{ groupId: tripToOsaka.id, userId: alice.id },
		{ groupId: tripToOsaka.id, userId: bob.id },
		{ groupId: tripToOsaka.id, userId: carol.id }
	]);

	const apartmentExpenses = await db
		.insert(schema.expense)
		.values([
			{
				groupId: apartment.id,
				paidByUserId: alice.id,
				categoryId: rent.id,
				description: 'August rent',
				amountCents: 180000
			},
			{
				groupId: apartment.id,
				paidByUserId: bob.id,
				categoryId: utilities.id,
				description: 'Electric bill',
				amountCents: 6400
			},
			{
				groupId: apartment.id,
				paidByUserId: alice.id,
				categoryId: food.id,
				description: 'Costco run',
				amountCents: 11250
			}
		])
		.returning();

	const osakaExpenses = await db
		.insert(schema.expense)
		.values([
			{
				groupId: tripToOsaka.id,
				paidByUserId: bob.id,
				categoryId: transport.id,
				description: 'Airport taxi',
				amountCents: 4500
			},
			{
				groupId: tripToOsaka.id,
				paidByUserId: carol.id,
				categoryId: food.id,
				description: 'Ramen night',
				amountCents: 9000
			},
			{
				groupId: tripToOsaka.id,
				paidByUserId: alice.id,
				categoryId: fun.id,
				description: 'Karaoke',
				amountCents: 6000
			},
			{
				groupId: tripToOsaka.id,
				paidByUserId: carol.id,
				categoryId: null,
				description: 'Convenience store snacks',
				amountCents: 1800
			}
		])
		.returning();

	const [rentExpense, electricExpense, costcoExpense] = apartmentExpenses;
	const [taxiExpense, ramenExpense, karaokeExpense, snacksExpense] = osakaExpenses;

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
		// Airport taxi, split three ways
		{ expenseId: taxiExpense.id, userId: alice.id, amountCents: 1500 },
		{ expenseId: taxiExpense.id, userId: bob.id, amountCents: 1500 },
		{ expenseId: taxiExpense.id, userId: carol.id, amountCents: 1500 },
		// Ramen night, split three ways
		{ expenseId: ramenExpense.id, userId: alice.id, amountCents: 3000 },
		{ expenseId: ramenExpense.id, userId: bob.id, amountCents: 3000 },
		{ expenseId: ramenExpense.id, userId: carol.id, amountCents: 3000 },
		// Karaoke, split three ways
		{ expenseId: karaokeExpense.id, userId: alice.id, amountCents: 2000 },
		{ expenseId: karaokeExpense.id, userId: bob.id, amountCents: 2000 },
		{ expenseId: karaokeExpense.id, userId: carol.id, amountCents: 2000 },
		// Convenience store snacks, Carol treated everyone, exact shares
		{ expenseId: snacksExpense.id, userId: alice.id, amountCents: 600 },
		{ expenseId: snacksExpense.id, userId: bob.id, amountCents: 600 },
		{ expenseId: snacksExpense.id, userId: carol.id, amountCents: 600 }
	]);

	await db.insert(schema.settlement).values([
		{ groupId: apartment.id, fromUserId: bob.id, toUserId: alice.id, amountCents: 5000 },
		{ groupId: tripToOsaka.id, fromUserId: alice.id, toUserId: carol.id, amountCents: 2000 }
	]);

	console.log('Seeded database.');
	client.close();
}

main();
