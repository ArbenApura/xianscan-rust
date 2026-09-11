// -- TYPES & STRUCTS -- //

export interface BenchmarkSample {
	name: string;
	raw: string;
	cleaned: string;
	translated: string;
}

export interface BenchmarkGallery {
	title: string;
	desc: string;
	samples: BenchmarkSample[];
}

// -- BENCHMARK SAMPLES AND GALLERY DATA -- //

export const BENCHMARK_GALLERIES: Record<string, { title: string; desc: string; samples: Array<{ name: string; raw: string; cleaned: string; translated: string }> }> = {
		'benchmarks/manhua': {
			title: 'Chinese Manhua (Xianxia & Wuxia)',
			desc: 'Tested on high-density dialogue, multi-line narrative boxes, and extensive Daoist realm terminology.',
			samples: [
				{
					name: '《斗罗大陆3龙王传说》 Soul Land 3: Legend of the Dragon King',
					raw: '/showcase/manhua_soulland3_raw.webp',
					cleaned: '/showcase/manhua_soulland3_cleaned.webp',
					translated: '/showcase/manhua_soulland3_translated.webp',
				},
				{
					name: '《重生之都市修仙》 Rebirth of the Urban Immortal Cultivator',
					raw: '/showcase/manhua_urbancultivator_raw.webp',
					cleaned: '/showcase/manhua_urbancultivator_cleaned.webp',
					translated: '/showcase/manhua_urbancultivator_translated.webp',
				},
				{
					name: '《斗破苍穹》 Battle Through the Heavens',
					raw: '/showcase/manhua_btth_raw.webp',
					cleaned: '/showcase/manhua_btth_cleaned.webp',
					translated: '/showcase/manhua_btth_translated.webp',
				},
				{
					name: '《武炼巅峰》 Martial Peak',
					raw: '/showcase/manhua_martialpeak_raw.webp',
					cleaned: '/showcase/manhua_martialpeak_cleaned.webp',
					translated: '/showcase/manhua_martialpeak_translated.webp',
				},
				{
					name: '《蛊真人》 Reverend Insanity (Gu Zhen Ren)',
					raw: '/showcase/manhua_guzhenren_raw.webp',
					cleaned: '/showcase/manhua_guzhenren_cleaned.webp',
					translated: '/showcase/manhua_guzhenren_translated.webp',
				},
			],
		},
		'benchmarks/manhwa': {
			title: 'Korean Manhwa & Webtoons',
			desc: 'Tested on continuous tall vertical rolls, non-text gutter valley slicing, and Korean Hangul OCR models.',
			samples: [
				{
					name: '《갓 오브 하이스쿨》 The God of High School',
					raw: '/showcase/manhwa_goh_raw.webp',
					cleaned: '/showcase/manhwa_goh_cleaned.webp',
					translated: '/showcase/manhwa_goh_translated.webp',
				},
				{
					name: '《역대급 영지 설계사》 The Greatest Estate Developer',
					raw: '/showcase/manhwa_estatedeveloper_raw.webp',
					cleaned: '/showcase/manhwa_estatedeveloper_cleaned.webp',
					translated: '/showcase/manhwa_estatedeveloper_translated.webp',
				},
				{
					name: '《전지적 독자 시점》 Omniscient Reader’s Viewpoint (ORV)',
					raw: '/showcase/manhwa_orv_raw.webp',
					cleaned: '/showcase/manhwa_orv_cleaned.webp',
					translated: '/showcase/manhwa_orv_translated.webp',
				},
				{
					name: '《할배무사와 지존 손녀》 Grandpa Warrior and the Supreme Granddaughter',
					raw: '/showcase/manhwa_martialgrandpa_raw.webp',
					cleaned: '/showcase/manhwa_martialgrandpa_cleaned.webp',
					translated: '/showcase/manhwa_martialgrandpa_translated.webp',
				},
				{
					name: '《화산귀환》 Return of the Mount Hua Sect',
					raw: '/showcase/manhwa_mounthua_raw.webp',
					cleaned: '/showcase/manhwa_mounthua_cleaned.webp',
					translated: '/showcase/manhwa_mounthua_translated.webp',
				},
			],
		},
		'benchmarks/manga': {
			title: 'Japanese Manga',
			desc: 'Tested on vertical text columns, right-to-left speech flow, and screentone inpainting reconstruction.',
			samples: [
				{
					name: '《ワンパンマン》 One Punch Man',
					raw: '/showcase/manga_opm_raw.webp',
					cleaned: '/showcase/manga_opm_cleaned.webp',
					translated: '/showcase/manga_opm_translated.webp',
				},
				{
					name: '《異世界賢者の転生無双》 Isekai Kenja no Tensei Musou',
					raw: '/showcase/manga_raw.webp',
					cleaned: '/showcase/manga_cleaned.webp',
					translated: '/showcase/manga_translated.webp',
				},
				{
					name: '《ドローイング 最強漫画家》 Drawing: Saikyou Mangaka',
					raw: '/showcase/manga_drawing_raw.webp',
					cleaned: '/showcase/manga_drawing_cleaned.webp',
					translated: '/showcase/manga_drawing_translated.webp',
				},
				{
					name: '《異世界じゃスローライフはままならない》 Slow Life in Another World',
					raw: '/showcase/manga_slowlife_raw.webp',
					cleaned: '/showcase/manga_slowlife_cleaned.webp',
					translated: '/showcase/manga_slowlife_translated.webp',
				},
				{
					name: '《チェンソーマン》 Chainsaw Man',
					raw: '/showcase/manga_csm_raw.webp',
					cleaned: '/showcase/manga_csm_cleaned.webp',
					translated: '/showcase/manga_csm_translated.webp',
				},
			],
		},
	};
