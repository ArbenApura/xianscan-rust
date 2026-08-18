// REGION DECOLLISION AND SPATIAL LAYOUT
import type { TypesetRegion } from './stat-panel';

export function decollideRegions(regions: TypesetRegion[]): TypesetRegion[] {
	if (regions.length <= 1) return regions;
	const adjusted = regions.map((r) => ({
		...r,
		box: { ...r.box },
	}));

	const margin = 4;

	for (let i = 0; i < adjusted.length; i++) {
		for (let j = i + 1; j < adjusted.length; j++) {
			const a = adjusted[i];
			const b = adjusted[j];

			const xOverlap = Math.min(a.box.x + a.box.w, b.box.x + b.box.w) - Math.max(a.box.x, b.box.x);
			const yOverlap = Math.min(a.box.y + a.box.h, b.box.y + b.box.h) - Math.max(a.box.y, b.box.y);

			if (xOverlap > 0 && yOverlap > 0) {
				const areaA = a.box.w * a.box.h;
				const areaB = b.box.w * b.box.h;
				const overlapArea = xOverlap * yOverlap;
				const minArea = Math.min(areaA, areaB);

				if (minArea > 0 && overlapArea / minArea > 0.50) {
					continue;
				}

				if (yOverlap <= xOverlap) {
					const top = a.box.y <= b.box.y ? a : b;
					const bot = a.box.y <= b.box.y ? b : a;

					const shift = Math.ceil((yOverlap + margin) / 2);
					top.box.h = Math.max(10, top.box.h - shift);
					bot.box.y = bot.box.y + shift;
					bot.box.h = Math.max(10, bot.box.h - shift);
				} else {
					const left = a.box.x <= b.box.x ? a : b;
					const right = a.box.x <= b.box.x ? b : a;

					const shift = Math.ceil((xOverlap + margin) / 2);
					left.box.w = Math.max(10, left.box.w - shift);
					right.box.x = right.box.x + shift;
					right.box.w = Math.max(10, right.box.w - shift);
				}
			}
		}
	}

	return adjusted;
}
