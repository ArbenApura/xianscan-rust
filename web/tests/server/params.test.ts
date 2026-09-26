import { describe, it, expect } from 'vitest';
import { intParam } from '$lib/server/params';

const at = (qs: string) => new URL(`http://localhost/x${qs}`);

describe('intParam', () => {
	it('uses the fallback when missing or not a plain integer', () => {
		expect(intParam(at(''), 'w', 280, 80, 800)).toBe(280);
		expect(intParam(at('?w=abc'), 'w', 280, 80, 800)).toBe(280);
		expect(intParam(at('?w=1e3'), 'w', 280, 80, 800)).toBe(280);
		expect(intParam(at('?w=12.5'), 'w', 280, 80, 800)).toBe(280);
		expect(intParam(at('?w='), 'w', 280, 80, 800)).toBe(280);
	});

	it('clamps negatives and values over the max', () => {
		expect(intParam(at('?w=-5'), 'w', 280, 80, 800)).toBe(80);
		expect(intParam(at('?w=100000'), 'w', 280, 80, 800)).toBe(800);
		expect(intParam(at('?w=99999999999999999999'), 'w', 280, 80, 800)).toBe(800);
	});

	it('passes through values in range', () => {
		expect(intParam(at('?w=320'), 'w', 280, 80, 800)).toBe(320);
		expect(intParam(at('?w=%20320%20'), 'w', 280, 80, 800)).toBe(320);
	});
});
