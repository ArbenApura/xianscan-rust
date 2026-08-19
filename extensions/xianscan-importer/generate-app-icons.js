import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { Resvg } from '@resvg/resvg-js';

const assetsDir = resolve('../../assets');
if (!existsSync(assetsDir)) mkdirSync(assetsDir, { recursive: true });

const svgSource = resolve('public/icons/xianscan.svg');
const svg = readFileSync(svgSource, 'utf8');

// 1. Generate ICO with embedded PNG layers: 16, 24, 32, 48, 64, 128, 256
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256];
const pngBuffers = [];

for (const size of ICO_SIZES) {
	const resvg = new Resvg(svg, {
		fitTo: { mode: 'width', value: size },
		background: 'rgba(0,0,0,0)'
	});
	const png = resvg.render().asPng();
	pngBuffers.push({ size, png });
}

// Build standard Windows ICO binary header + directory entries + PNG data
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Type (1 = ICO)
header.writeUInt16LE(pngBuffers.length, 4); // Count of images

let offset = 6 + (16 * pngBuffers.length);
const entries = [];
const imageChunks = [];

for (const item of pngBuffers) {
	const entry = Buffer.alloc(16);
	const width = item.size >= 256 ? 0 : item.size;
	const height = item.size >= 256 ? 0 : item.size;

	entry.writeUInt8(width, 0);
	entry.writeUInt8(height, 1);
	entry.writeUInt8(0, 2); // Palette colors
	entry.writeUInt8(0, 3); // Reserved
	entry.writeUInt16LE(1, 4); // Color planes
	entry.writeUInt16LE(32, 6); // Bits per pixel
	entry.writeUInt32LE(item.png.length, 8); // Size of image data
	entry.writeUInt32LE(offset, 12); // Offset of image data

	entries.push(entry);
	imageChunks.push(item.png);
	offset += item.png.length;
}

const finalIco = Buffer.concat([header, ...entries, ...imageChunks]);
writeFileSync(resolve(assetsDir, 'icon.ico'), finalIco);
console.log(`Generated assets/icon.ico (${finalIco.length} bytes, ${ICO_SIZES.length} resolutions: ${ICO_SIZES.join(', ')})`);

// 2. Generate 512px and 1024px PNGs for macOS / Linux
const resvg512 = new Resvg(svg, { fitTo: { mode: 'width', value: 512 }, background: 'rgba(0,0,0,0)' });
const png512 = resvg512.render().asPng();
writeFileSync(resolve(assetsDir, 'icon.png'), png512);
console.log(`Generated assets/icon.png (512x512, ${png512.length} bytes)`);

const resvg1024 = new Resvg(svg, { fitTo: { mode: 'width', value: 1024 }, background: 'rgba(0,0,0,0)' });
const png1024 = resvg1024.render().asPng();
writeFileSync(resolve(assetsDir, 'icon-1024.png'), png1024);
console.log(`Generated assets/icon-1024.png (1024x1024, ${png1024.length} bytes)`);

// 3. Generate Linux .desktop specification
const desktopFile = `[Desktop Entry]
Name=XianScan
Comment=Native Comic Translation Server for Chinese Manhua, Korean Manhwa & Japanese Manga
Exec=xianscan
Icon=xianscan
Terminal=false
Type=Application
Categories=Graphics;Translation;Utility;
Keywords=comic;manga;manhua;manhwa;ocr;translation;typesetting;
`;
writeFileSync(resolve(assetsDir, 'xianscan.desktop'), desktopFile, 'utf8');
console.log(`Generated assets/xianscan.desktop`);
