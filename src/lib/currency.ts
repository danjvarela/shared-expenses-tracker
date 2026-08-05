export const DEFAULT_CURRENCY_CODE = 'PHP';

export const CURRENCIES = [
	{ code: 'PHP', name: 'Philippine Peso' },
	{ code: 'USD', name: 'US Dollar' },
	{ code: 'EUR', name: 'Euro' },
	{ code: 'GBP', name: 'British Pound' },
	{ code: 'JPY', name: 'Japanese Yen' },
	{ code: 'SGD', name: 'Singapore Dollar' },
	{ code: 'AUD', name: 'Australian Dollar' }
] as const;

export function formatAmountCents(amountCents: number, currencyCode: string) {
	return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(
		amountCents / 100
	);
}
