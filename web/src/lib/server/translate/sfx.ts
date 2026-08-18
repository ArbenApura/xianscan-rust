// MULTILINGUAL SFX DICTIONARY AND FALLBACKS
export const KNOWN_MULTILINGUAL_SFX: Record<string, Record<string, string>> = {
	zh: {
		'哒': 'TAP!',
		'嗒': 'STEP!',
		'哒哒': 'TAP-TAP!',
		'嗒嗒': 'PITTER-PATTER!',
		'啪': 'SNAP!',
		'啪啪': 'CLAP-CLAP!',
		'咚': 'THUD!',
		'咚咚': 'THUMP-THUMP!',
		'哐': 'CLANG!',
		'哐当': 'CLANG!',
		'嗖': 'SWOOSH!',
		'唰': 'SWISH!',
		'砰': 'BANG!',
		'嘭': 'POW!',
		'咔': 'CLICK!',
		'咔嚓': 'CRACK!',
		'轰': 'BOOM!',
		'轰隆': 'RUMBLE!',
		'呼': 'WHOOSH!',
		'哧': 'CHIRP!',
		'嘶': 'HISS!',
		'嗡': 'BUZZ!',
		'踏': 'STEP!',
		'铛': 'CLANG!',
	},
	ru: {
		'хрусть': 'CRACK!',
		'хрусь': 'SNAP!',
		'хрясь': 'SMACK!',
		'щелк': 'CLICK!',
		'щёлк': 'CLICK!',
		'бум': 'BOOM!',
		'бах': 'BANG!',
		'бабах': 'KABOOM!',
		'бам': 'BAM!',
		'вжух': 'SWOOSH!',
		'шурх': 'RUSTLE!',
		'кап': 'DRIP!',
		'кап-кап': 'DRIP-DRIP!',
		'скрип': 'CREAK!',
		'чмок': 'SMOOCH!',
		'чпок': 'POP!',
		'тук': 'KNOCK!',
		'тук-тук': 'KNOCK-KNOCK!',
		'стук': 'THUD!',
		'дзынь': 'CLINK!',
		'дзинь': 'RING!',
		'плюх': 'SPLASH!',
		'пшик': 'POOF!',
		'хлоп': 'CLAP!',
		'шлеп': 'SLAP!',
		'шлёп': 'SLAP!',
		'топ': 'STEP!',
		'топ-топ': 'PITTER-PATTER!',
		'ах': 'AH!',
		'ох': 'OH!',
		'ух': 'UGH!',
		'ай': 'OUCH!',
		'ой': 'OOPS!',
	},
	ja: {
		'ドキドキ': 'BA-DUMP!',
		'ドン': 'BOOM!',
		'ドカーン': 'KABOOM!',
		'ニコ': 'SMILE',
		'ニコニコ': 'GRIN',
		'ガタッ': 'RATTLE!',
		'ガタガタ': 'CLATTER!',
		'パチパチ': 'CLAP-CLAP!',
		'ハァ': 'HUFF',
		'フゥ': 'SIGH',
		'ピクッ': 'TWITCH!',
		'ギラッ': 'FLASH!',
		'ゴクッ': 'GULP',
		'ザッ': 'SWISH!',
		'シーン': '*SILENCE*',
		'バッ': 'BAM!',
		'ビクッ': 'STARTLE!',
		'フワッ': 'FLOAT',
		'ボカン': 'BOOM!',
	},
	ko: {
		'쿵': 'THUD!',
		'쾅': 'SLAM!',
		'두근두근': 'POUND-POUND!',
		'하하': 'HAHA!',
		'흑흑': 'SOB-SOB',
		'슥': 'SWISH!',
		'척': 'STEP!',
		'탁': 'SNAP!',
		'퍽': 'SMACK!',
		'우르르': 'RUMBLE!',
		'번쩍': 'FLASH!',
		'찰칵': 'CLICK!',
		'씨익': 'SMIRK',
	},
	fr: {
		'vlan': 'WHAM!',
		'bim': 'POW!',
		'bam': 'BAM!',
		'boum': 'BOOM!',
		'pif': 'POW!',
		'paf': 'SLAP!',
		'clic': 'CLICK!',
		'crac': 'CRACK!',
		'toc': 'KNOCK!',
		'pan': 'BANG!',
	},
	es: {
		'pum': 'BOOM!',
		'bang': 'BANG!',
		'zas': 'WHACK!',
		'toc': 'KNOCK!',
		'ñam': 'NOM-NOM',
		'plaf': 'SPLASH!',
		'boing': 'BOING!',
		'chof': 'SQUISH!',
	},
};

export const KNOWN_CHINESE_SFX: Record<string, string> = KNOWN_MULTILINGUAL_SFX.zh;

function normalizeCyrillicOcrNoise(text: string): string {
	return text
		.toLowerCase()
		.replace(/4/g, 'х')
		.replace(/p/g, 'р')
		.replace(/y/g, 'у')
		.replace(/c/g, 'с')
		.replace(/t/g, 'т')
		.replace(/b/g, 'ь')
		.replace(/m/g, 'т')
		.replace(/6/g, 'б')
		.replace(/0/g, 'о')
		.replace(/3/g, 'з');
}

export function getKnownSfxTranslation(source: string, lang?: string): string | null {
	if (!source) return null;
	const stripped = source.replace(/[!！?？~～\s()（）[\]{}'"`«»]/g, '').trim();
	if (!stripped) return null;

	const langKey = lang ? lang.split('-')[0].toLowerCase() : null;

	if (langKey && KNOWN_MULTILINGUAL_SFX[langKey]) {
		const dict = KNOWN_MULTILINGUAL_SFX[langKey];
		if (dict[stripped]) return dict[stripped];
		const lower = stripped.toLowerCase();
		if (dict[lower]) return dict[lower];

		if (langKey === 'ru' || langKey === 'uk' || langKey === 'be') {
			const normalizedCyrillic = normalizeCyrillicOcrNoise(stripped);
			if (KNOWN_MULTILINGUAL_SFX.ru[normalizedCyrillic]) {
				return KNOWN_MULTILINGUAL_SFX.ru[normalizedCyrillic];
			}
		}
	}

	for (const [, dict] of Object.entries(KNOWN_MULTILINGUAL_SFX)) {
		if (dict[stripped]) return dict[stripped];
		const lower = stripped.toLowerCase();
		if (dict[lower]) return dict[lower];
	}

	const normCyrillic = normalizeCyrillicOcrNoise(stripped);
	if (KNOWN_MULTILINGUAL_SFX.ru[normCyrillic]) {
		return KNOWN_MULTILINGUAL_SFX.ru[normCyrillic];
	}

	return null;
}
