import { build, context } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';

const isWatch = process.argv.includes('--watch');

const buildOptions = {
	entryPoints: ['src/popup.ts', 'src/background.ts', 'src/content.ts'],
	bundle: true,
	outdir: 'dist',
	format: 'iife',
	target: ['chrome95', 'firefox109'],
	minify: !isWatch
};

function prepareDist() {
	if (!existsSync('dist')) mkdirSync('dist', { recursive: true });
	if (existsSync('public')) {
		cpSync('public', 'dist', { recursive: true });
	}

	// Read base manifest
	const baseManifest = JSON.parse(readFileSync('public/manifest.json', 'utf8'));

	// 1. Chrome / Universal Manifest (service_worker)
	const chromeManifest = { ...baseManifest };
	delete chromeManifest.browser_specific_settings;
	chromeManifest.background = {
		service_worker: 'background.js'
	};
	writeFileSync('dist/manifest.json', JSON.stringify(chromeManifest, null, 2));

	// 2. Firefox Specific Dist (background.scripts for MV3 Event Pages)
	if (!existsSync('dist-firefox')) mkdirSync('dist-firefox', { recursive: true });
	cpSync('dist', 'dist-firefox', { recursive: true });

	const firefoxManifest = { ...baseManifest };
	delete firefoxManifest.version_name;
	firefoxManifest.background = {
		scripts: ['background.js']
	};
	firefoxManifest.browser_specific_settings = {
		gecko: {
			id: 'importer@xianscan.local',
			strict_min_version: '109.0'
		}
	};
	writeFileSync('dist-firefox/manifest.json', JSON.stringify(firefoxManifest, null, 2));
}

if (isWatch) {
	prepareDist();
	const ctx = await context(buildOptions);
	await ctx.watch();
	console.log('Watching for changes...');
} else {
	await build(buildOptions);
	prepareDist();
	console.log('Build complete (Chromium dist/ + Firefox dist-firefox/).');
}
