export type SplitMethod = 'equal' | 'percentage' | 'exact';

export interface SplitMember {
	userId: string;
	included: boolean;
	percent?: number;
	exactAmountCents?: number;
}

export interface ResolveSplitsInput {
	method: SplitMethod;
	amountCents: number;
	payerId: string;
	members: Array<SplitMember>;
}

function distributeRemainder(
	amounts: Array<{ userId: string; amountCents: number }>,
	remainder: number,
	payerId: string
): Array<{ userId: string; amountCents: number }> {
	if (remainder === 0) return amounts;

	const recipientIndex = amounts.findIndex((split) => split.userId === payerId);
	const targetIndex = recipientIndex >= 0 ? recipientIndex : 0;

	return amounts.map((split, index) =>
		index === targetIndex ? { ...split, amountCents: split.amountCents + remainder } : split
	);
}

function resolveEqual(
	included: Array<SplitMember>,
	amountCents: number,
	payerId: string
): Array<{ userId: string; amountCents: number }> {
	const share = Math.floor(amountCents / included.length);
	const amounts = included.map((member) => ({ userId: member.userId, amountCents: share }));
	const remainder = amountCents - share * included.length;
	return distributeRemainder(amounts, remainder, payerId);
}

function resolvePercentage(
	included: Array<SplitMember>,
	amountCents: number,
	payerId: string
): Array<{ userId: string; amountCents: number }> {
	const amounts = included.map((member) => ({
		userId: member.userId,
		amountCents: Math.round((amountCents * (member.percent ?? 0)) / 100)
	}));
	const remainder = amountCents - amounts.reduce((sum, split) => sum + split.amountCents, 0);
	return distributeRemainder(amounts, remainder, payerId);
}

function resolveExact(
	included: Array<SplitMember>
): Array<{ userId: string; amountCents: number }> {
	return included.map((member) => ({
		userId: member.userId,
		amountCents: member.exactAmountCents ?? 0
	}));
}

export function resolveSplits(
	input: ResolveSplitsInput
): Array<{ userId: string; amountCents: number }> {
	const included = input.members.filter((member) => member.included);

	switch (input.method) {
		case 'equal':
			return resolveEqual(included, input.amountCents, input.payerId);
		case 'percentage':
			return resolvePercentage(included, input.amountCents, input.payerId);
		case 'exact':
			return resolveExact(included);
	}
}
