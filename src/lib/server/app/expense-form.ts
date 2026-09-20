import { resolveSplits, type SplitMethod } from '$lib/server/app/split-resolver';

export interface ValidatedExpenseForm {
	description: string;
	amountCents: number;
	date: Date;
	paidByUserId: string;
	categoryId: string | null;
	splits: Array<{ userId: string; amountCents: number }>;
}

export function parseAmountCents(raw: FormDataEntryValue | number | null): number | null {
	if (typeof raw === 'string' && raw.trim() === '') return null;
	if (typeof raw !== 'string' && typeof raw !== 'number') return null;
	const pesos = Number(raw);
	if (Number.isNaN(pesos)) return null;
	return Math.round(pesos * 100);
}

export function validateExpenseForm(
	formData: FormData,
	members: Array<{ userId: string }>,
	frozenAmountCents = 0,
	lockedPaidByUserId?: string
): { error: string } | { data: ValidatedExpenseForm } {
	const description = formData.get('description');
	const amountCents = parseAmountCents(formData.get('amount'));
	const dateRaw = formData.get('date');
	const paidByUserId = formData.get('paidByUserId');
	const categoryIdRaw = formData.get('categoryId');
	const method = formData.get('splitMethod') as SplitMethod | null;

	if (typeof description !== 'string' || description.trim() === '') {
		return { error: 'Description is required' };
	}
	if (amountCents === null || amountCents <= 0) {
		return { error: 'Enter a valid amount' };
	}
	if (typeof dateRaw !== 'string' || dateRaw.trim() === '') {
		return { error: 'Date is required' };
	}
	const date = new Date(dateRaw);
	if (Number.isNaN(date.getTime())) {
		return { error: 'Invalid date' };
	}
	if (
		typeof paidByUserId !== 'string' ||
		(!members.some((member) => member.userId === paidByUserId) &&
			!(lockedPaidByUserId !== undefined && paidByUserId === lockedPaidByUserId))
	) {
		return { error: 'Select who paid' };
	}
	if (method !== 'equal' && method !== 'percentage' && method !== 'exact') {
		return { error: 'Select a split method' };
	}

	const categoryId =
		typeof categoryIdRaw === 'string' && categoryIdRaw !== '' && categoryIdRaw !== 'none'
			? categoryIdRaw
			: null;

	const splitMembers = members.map((member) => {
		const included = formData.get(`included-${member.userId}`) === 'on';
		const percentRaw = formData.get(`percent-${member.userId}`);
		const exactRaw = formData.get(`exact-${member.userId}`);
		return {
			userId: member.userId,
			included,
			percent: typeof percentRaw === 'string' && percentRaw !== '' ? Number(percentRaw) : undefined,
			exactAmountCents:
				typeof exactRaw === 'string' && exactRaw !== ''
					? (parseAmountCents(exactRaw) ?? 0)
					: undefined
		};
	});

	if (!lockedPaidByUserId && !splitMembers.some((member) => member.included)) {
		return { error: 'At least one member must be included in the split' };
	}

	const splits = resolveSplits({
		method,
		amountCents,
		payerId: paidByUserId,
		members: splitMembers
	});

	const sum = splits.reduce((total, split) => total + split.amountCents, 0);
	if (sum + frozenAmountCents !== amountCents) {
		return { error: 'Split amounts do not add up to the total' };
	}

	return {
		data: {
			description: description.trim(),
			amountCents,
			date,
			paidByUserId,
			categoryId,
			splits
		}
	};
}
