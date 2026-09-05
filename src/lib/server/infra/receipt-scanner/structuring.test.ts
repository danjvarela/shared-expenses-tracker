import { describe, it, expect } from 'vitest';
import { normalize } from './structuring';

describe('normalize', () => {
	it('maps the raw payload into ScanResult, renaming total/amount to decimal fields', () => {
		expect(
			normalize({
				merchant: 'Fresh Mart',
				date: '2026-08-21',
				total: '12.48',
				lineItems: [
					{ description: 'Milk', amount: '3.49' },
					{ description: 'Bread', amount: '2.10' }
				]
			})
		).toEqual({
			merchant: 'Fresh Mart',
			date: '2026-08-21',
			totalDecimal: '12.48',
			lineItems: [
				{ description: 'Milk', amountDecimal: '3.49' },
				{ description: 'Bread', amountDecimal: '2.10' }
			]
		});
	});

	it('drops empty optional fields and line items missing description or amount', () => {
		const result = normalize({
			merchant: '',
			total: '   ',
			lineItems: [
				{ description: 'Milk', amount: '3.49' },
				{ description: 'Subtotal', amount: '' },
				{ description: '', amount: '0.99' }
			]
		});

		expect(result).toEqual({
			lineItems: [{ description: 'Milk', amountDecimal: '3.49' }]
		});
		expect('merchant' in result).toBe(false);
		expect('date' in result).toBe(false);
		expect('totalDecimal' in result).toBe(false);
	});

	it('returns an empty lineItems array when the payload has none', () => {
		expect(normalize({ merchant: 'X' })).toEqual({ merchant: 'X', lineItems: [] });
		expect(normalize(null)).toEqual({ lineItems: [] });
		expect(normalize({ lineItems: 'not-an-array' })).toEqual({ lineItems: [] });
	});
});
