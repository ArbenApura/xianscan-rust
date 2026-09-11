import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const resvgPkg = resolve('../extensions/xianscan-importer/node_modules/@resvg/resvg-js');
const { Resvg } = existsSync(resvgPkg) ? require(resvgPkg) : require('@resvg/resvg-js');

const staticDir = resolve('static');
const svgSource = resolve(staticDir, 'favicon.svg');
const svg = readFileSync(svgSource, 'utf8');

const SIZES = [
	{ name: 'favicon-16x16.png', size: 16 },
	{ name: 'favicon-32x32.png', size: 32 },
	{ name: 'favicon-48x48.png', size: 48 },
	{ name: 'favicon-96x96.png', size: 96 },
	{ name: 'apple-touch-icon.png', size: 180 },
	{ name: 'icon-192.png', size: 192 },
	{ name: 'icon-512.png', size: 512 }
];

for (const item of SIZES) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: item.size },
		background: 'rgba(0,0,0,0)'
	});
	const png = resvg.render().asPng();
	writeFileSync(join(staticDir, item.name), png);
	console.log(`Generated ${item.name} (${png.length} bytes)`);
}

// Generate multi-resolution Windows ICO (16, 24, 32, 48)
const ICO_SIZES = [16, 24, 32, 48];
const pngBuffers = [];
for (const size of ICO_SIZES) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: size },
		background: 'rgba(0,0,0,0)'
	});
	pngBuffers.push({ size, png: resvg.render().asPng() });
}

const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(pngBuffers.length, 4);

let offset = 6 + 16 * pngBuffers.length;
const entries = [];
const imageChunks = [];

for (const item of pngBuffers) {
	const entry = Buffer.alloc(16);
	entry.writeUInt8(item.size, 0);
	entry.writeUInt8(item.size, 1);
	entry.writeUInt8(0, 2);
	entry.writeUInt8(0, 3);
	entry.writeUInt16LE(1, 4);
	entry.writeUInt16LE(32, 6);
	entry.writeUInt32LE(item.png.length, 8);
	entry.writeUInt32LE(offset, 12);

	entries.push(entry);
	imageChunks.push(item.png);
	offset += item.png.length;
}

const finalIco = Buffer.concat([header, ...entries, ...imageChunks]);
writeFileSync(join(staticDir, 'favicon.ico'), finalIco);
console.log(`Generated favicon.ico (${finalIco.length} bytes)`);
