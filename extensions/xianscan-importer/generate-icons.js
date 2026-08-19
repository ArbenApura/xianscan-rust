import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { Resvg } from '@resvg/resvg-js';

const SIZES = [16, 24, 32, 48, 64, 96, 128];
const outDir = 'public/icons';
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const variants = [
	{ name: '', src: 'public/icons/xianscan.svg' },
	{ name: '-dark', src: 'public/icons/xianscan-dark.svg' },
	{ name: '-light', src: 'public/icons/xianscan-light.svg' }
];

for (const variant of variants) {
	const svg = readFileSync(variant.src, 'utf8');
	for (const size of SIZES) {
		const resvg = new Resvg(svg, {
			fitTo: { mode: 'width', value: size },
			background: 'rgba(0,0,0,0)',
			font: {
				loadSystemFonts: true,
				defaultFontFamily: 'SimSun'
			}
		});
		const png = resvg.render().asPng();
		const filename = variant.name === '' ? `icon-${size}.png` : `icon${variant.name}-${size}.png`;
		writeFileSync(`${outDir}/${filename}`, png);
		console.log(`${filename} (${png.length} bytes)`);
	}
}
