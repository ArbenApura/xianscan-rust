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
		// DINING & ORAL
		'냠냠': 'NOM NOM',
		'남남': 'NOM NOM',
		'쩝쩝': 'CHOMP CHOMP',
		'접접': 'CHOMP CHOMP',
		'우물우물': 'MUNCH MUNCH',
		'오물오물': 'CHEW CHEW',
		'꿀꺽': 'GULP',
		'벌컥': 'GLUG',
		'벌컥벌컥': 'CHUG-CHUG',
		'후루룩': 'SLURP',
		'후룩': 'SLURP',
		'쩝': 'CHOMP',
		'냠': 'NOM',
		// IMPACT & FORCE
		'쿵': 'THUD!',
		'쾅': 'SLAM!',
		'콰앙': 'BOOM!',
		'탁': 'SNAP!',
		'퍽': 'SMACK!',
		'팍': 'WHACK!',
		'챙': 'CLANG!',
		'와장창': 'CRASH!',
		'우르르': 'RUMBLE!',
		'번쩍': 'FLASH!',
		'찰칵': 'CLICK!',
		// MOVEMENT & VOCAL
		'슥': 'SWISH!',
		'스윽': 'SLIDE',
		'척': 'STEP!',
		'뚜벅뚜벅': 'TAP-TAP!',
		'바스락': 'RUSTLE',
		'힐끔': 'GLANCE',
		'덜덜': 'SHIVER',
		'두근두근': 'POUND-POUND!',
		'하하': 'HAHA!',
		'흑흑': 'SOB-SOB',
		'씨익': 'SMIRK',
		'한숨': 'SIGH',
		'휴': 'PHEW',
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
		'ゴクゴク': 'GLUG-GLUG',
		'モグモグ': 'MUNCH MUNCH',
		'クチャクチャ': 'CHOMP CHOMP',
		'ズルズル': 'SLURP',
		'ザッ': 'SWISH!',
		'シーン': '*SILENCE*',
		'バッ': 'BAM!',
		'ビクッ': 'STARTLE!',
		'フワッ': 'FLOAT',
		'ボカン': 'BOOM!',
	},
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
		'吧唧': 'CHOMP',
		'吧唧吧唧': 'CHOMP CHOMP',
		'咕噜': 'GULP',
		'咕噜咕噜': 'GLUG-GLUG',
		'吸溜': 'SLURP',
		'嚼': 'CHEW',
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
		'miam': 'YUM!',
		'slurp': 'SLURP!',
	},
	es: {
		'pum': 'BOOM!',
		'bang': 'BANG!',
		'zas': 'WHACK!',
		'toc': 'KNOCK!',
		'ñam': 'NOM-NOM',
		'ñam ñam': 'NOM NOM',
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

/**
 * NORMALIZE COMMON HANGUL VOWEL OCR SHIFTS (e.g. ㅑ <-> ㅏ, ㅕ <-> ㅓ)
 */
function normalizeHangulOcrVariants(text: string): string[] {
	const variants: string[] = [text];
	// 냠냠 <-> 남남
	if (text.includes('남')) variants.push(text.replace(/남/g, '냠'));
	if (text.includes('냠')) variants.push(text.replace(/냠/g, '남'));
	// 쩝쩝 <-> 접접
	if (text.includes('접')) variants.push(text.replace(/접/g, '쩝'));
	if (text.includes('쩝')) variants.push(text.replace(/쩝/g, '접'));
	return variants;
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

		if (langKey === 'ko') {
			for (const variant of normalizeHangulOcrVariants(stripped)) {
				if (dict[variant]) return dict[variant];
			}
		}

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

	for (const variant of normalizeHangulOcrVariants(stripped)) {
		if (KNOWN_MULTILINGUAL_SFX.ko[variant]) {
			return KNOWN_MULTILINGUAL_SFX.ko[variant];
		}
	}

	const normCyrillic = normalizeCyrillicOcrNoise(stripped);
	if (KNOWN_MULTILINGUAL_SFX.ru[normCyrillic]) {
		return KNOWN_MULTILINGUAL_SFX.ru[normCyrillic];
	}

	return null;
}
