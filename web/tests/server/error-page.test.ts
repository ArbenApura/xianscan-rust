import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('error page (+error.svelte)', () => {
	const errorPagePath = join(process.cwd(), 'src', 'routes', '+error.svelte');

	it('exists in src/routes/+error.svelte', () => {
		expect(existsSync(errorPagePath)).toBe(true);
	});

	it('contains required navigation and diagnostic hooks', () => {
		const content = readFileSync(errorPagePath, 'utf-8');
		// Must use $page store to read status & error
		expect(content).toContain('$page.status');
		expect(content).toContain('$page.error');
		// Must contain navigation to library/home
		expect(content).toContain('/app');
		// Must contain reload and copy diagnostics functionality
		expect(content).toContain('copyDiagnostics');
		expect(content).toContain('handleReload');
		// Must use XianScan themed components
		expect(content).toContain('Seal');
		expect(content).toContain('InkDivider');
	});
});
