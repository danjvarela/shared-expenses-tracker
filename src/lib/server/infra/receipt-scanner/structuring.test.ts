import { describe, it, expect } from 'vitest';
import { RESPONSE_FORMAT, extractJson, normalize } from './structuring';

describe('RESPONSE_FORMAT', () => {
	it('is an object schema requiring only lineItems', () => {
		expect(RESPONSE_FORMAT.type).toBe('object');
		expect(RESPONSE_FORMAT.required).toEqual(['lineItems']);
	});

	it('declares string merchant/date/total fields and an array of description/amount items', () => {
		const { properties } = RESPONSE_FORMAT;
		expect(properties.merchant.type).toBe('string');
		expect(properties.date.type).toBe('string');
		expect(properties.total.type).toBe('string');
		expect(properties.lineItems.type).toBe('array');
		expect(properties.lineItems.items.required).toEqual(['description', 'amount']);
	});
});

describe('extractJson', () => {
	it('extracts the JSON object from a fenced code block', () => {
		const content = 'Here you go:\n```json\n{"merchant": "X"}\n```\nDone.';
		expect(extractJson(content)).toBe('{"merchant": "X"}');
	});

	it('extracts the outermost JSON object from bare text', () => {
		const content = 'noise {"a": 1, "b": {"c": 2}} trailing';
		expect(extractJson(content)).toBe('{"a": 1, "b": {"c": 2}}');
	});

	it('returns trimmed content when no JSON object is present', () => {
		expect(extractJson('  no json here  ')).toBe('no json here');
	});
});

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
