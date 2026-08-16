// HARNESS SMOKE TESTS — PROVE THE VITEST SETUP (PLUGIN, ALIASES, IN-MEMORY SQLITE) WORKS END TO END.
// THESE ARE THE TDD BASELINE: ANY FUTURE SUITE RUNS ON THIS SAME HARNESS.
import { env } from '$env/dynamic/private';
import Database from 'better-sqlite3';
import { describe, expect, it } from 'vitest';

describe('test harness', () => {
	it('runs in-memory SQLite via better-sqlite3', () => {
		const db = new Database(':memory:');
		db.exec('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT NOT NULL)');
		db.prepare('INSERT INTO t (v) VALUES (?)').run('hello');
		const row = db.prepare('SELECT v FROM t WHERE id = 1').get() as { v: string };
		expect(row.v).toBe('hello');
		db.close();
	});

	it('resolves $env/dynamic/private to live process.env', () => {
		expect(env).toBe(process.env);
		process.env.TEST_MARKER = 'x';
		expect(env.TEST_MARKER).toBe('x');
		delete process.env.TEST_MARKER;
	});
});
