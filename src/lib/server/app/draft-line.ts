import { AppError } from '$lib/server/app/error';
import { parseAmountCents } from '$lib/server/app/expense-form';
import { resolveSplits } from '$lib/server/app/split-resolver';

export interface DraftLineInput {
	description: string;
	amountDecimal: string;
	categoryId: string | null;
	date: string;
	percents: Record<string, string>;
}

export interface NormalizedDraftLine {
	description: string;
	amountCents: number;
	categoryId: string | null;
	date: Date;
	splits: Array<{ userId: string; amountCents: number }>;
}

export class DraftValidationError extends AppError {
	constructor(message: string) {
		super(message, 400);
	}
}

function normalizeCategoryId(raw: string | null): string | null {
	return typeof raw === 'string' && raw !== '' && raw !== 'none' ? raw : null;
}

function parseLineDate(raw: string): Date {
	if (typeof raw !== 'string' || raw.trim() === '') {
		throw new DraftValidationError('Date is required for every line');
	}
	const date = new Date(raw);
	if (Number.isNaN(date.getTime())) {
		throw new DraftValidationError('Invalid date');
	}
	return date;
}

export function resolveLineSplits(
	amountCents: number,
	paidByUserId: string,
	members: Array<{ userId: string; defaultSplitPercent: number | null }>,
	percents: Record<string, string>
): Array<{ userId: string; amountCents: number }> {
	const fromPercents = members.map((member) => {
		const raw = percents[member.userId];
		const included = typeof raw === 'string' && raw.trim() !== '';
		let percent: number | undefined;
		if (included) {
			percent = Number(raw);
			if (Number.isNaN(percent) || percent < 0) {
				throw new DraftValidationError('Split percentages must be non-negative numbers');
			}
		}
		return { userId: member.userId, included, percent };
	});

	if (fromPercents.some((member) => member.included)) {
		return resolveSplits({
			method: 'percentage',
			amountCents,
			payerId: paidByUserId,
			members: fromPercents
		});
	}

	// No custom split specified — fall back to the group default split.
	const fromDefaults = members.map((member) => ({
		userId: member.userId,
		included: member.defaultSplitPercent !== null,
		percent: member.defaultSplitPercent ?? undefined
	}));

	if (fromDefaults.some((member) => member.included)) {
		return resolveSplits({
			method: 'percentage',
			amountCents,
			payerId: paidByUserId,
			members: fromDefaults
		});
	}

	// No default split configured — split equally among all members.
	return resolveSplits({
		method: 'equal',
		amountCents,
		payerId: paidByUserId,
		members: members.map((member) => ({ userId: member.userId, included: true }))
	});
}

export function normalizeDraftLines(
	lines: DraftLineInput[],
	paidByUserId: string,
	members: Array<{ userId: string; defaultSplitPercent: number | null }>
): NormalizedDraftLine[] {
	if (!Array.isArray(lines) || lines.length === 0) {
		throw new DraftValidationError('Draft has no line items');
	}

	return lines.map((line) => {
		if (typeof line.description !== 'string' || line.description.trim() === '') {
			throw new DraftValidationError('Description is required for every line');
		}
		const amountCents = parseAmountCents(line.amountDecimal);
		if (amountCents === null || amountCents <= 0) {
			throw new DraftValidationError('Enter a valid amount for every line');
		}
		const date = parseLineDate(line.date);
		const splits = resolveLineSplits(amountCents, paidByUserId, members, line.percents);
		return {
			description: line.description.trim(),
			amountCents,
			categoryId: normalizeCategoryId(line.categoryId),
			date,
			splits
		};
	});
}
