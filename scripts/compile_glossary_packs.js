import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// All 20 supported system languages
const LANGUAGES = [
	'zh-Hans', 'zh-Hant', 'en', 'ja', 'ko',
	'es', 'fr', 'de', 'ru', 'pt',
	'it', 'id', 'th', 'tr', 'nl',
	'pl', 'hi', 'uk', 'sv', 'fi'
];

const THEMES = ['xianxia', 'murim', 'system', 'fantasy', 'rofan', 'palace', 'scifi'];

// Load existing reconstructed entities
const masterEntitiesPath = path.resolve(__dirname, 'reconstructed_master_entities.json');
let masterEntities = JSON.parse(fs.readFileSync(masterEntitiesPath, 'utf8'));

// Deduplicate masterEntities by theme + English translation
const uniqueEntitiesMap = new Map();
for (const entity of masterEntities) {
	const key = `${entity.theme}::${entity.translations.en}`;
	uniqueEntitiesMap.set(key, entity);
}

// Master list of new researched entities across cultivation, murim, hunter, rofan, palace, and military ranks
const newEntries = [
	// =========================================================================
	// 1. CULTIVATION & XIANXIA REALMS
	// =========================================================================
	{
		theme: 'xianxia',
		category: 'realm',
		gender: 'neuter',
		context: 'Preliminary physical conditioning realm before gathering spiritual Qi; strengthening muscles and bones.',
		translations: {
			'zh-Hans': '淬体期',
			'zh-Hant': '淬體期',
			'en': 'Body Tempering',
			'ja': '淬体期',
			'ko': '체련기',
			'es': 'Templado Corporal',
			'fr': 'Trempe Corporelle',
			'de': 'Körperhärtung',
			'ru': 'Закалка Тела',
			'pt': 'Têmpera Corporal',
			'it': 'Tempra del Corpo',
			'id': 'Penyempurnaan Tubuh',
			'th': 'ขัดเกลาร่างกาย',
			'tr': 'Vücut Sertleştirme',
			'nl': 'Lichaamsverharding',
			'pl': 'Hartowanie Ciała',
			'hi': 'शरीर तपन (Body Tempering)',
			'uk': 'Загартування Тіла',
			'sv': 'Kroppshärdning',
			'fi': 'Kehon Karkaisu'
		}
	},

	// =========================================================================
	// 2. MURIM MARTIAL ARTS REALM PROGRESSION
	// =========================================================================
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Novice martial artist with crude combat instincts and negligible internal energy.',
		translations: {
			'zh-Hans': '三流高手',
			'zh-Hant': '三流高手',
			'en': 'Third-rate Martial Artist',
			'ja': '三流武芸者',
			'ko': '삼류',
			'es': 'Artista Marcial de Tercera',
			'fr': 'Artiste Martial de Troisième Ordre',
			'de': 'Drittklassiger Kampfkünstler',
			'ru': 'Мастер Третьего Ранга',
			'pt': 'Artista Marcial de Terceira Classe',
			'it': 'Artista Marziale di Terza Classe',
			'id': 'Pendekar Kelas Tiga',
			'th': 'จอมยุทธ์ชั้นสาม',
			'tr': 'Üçüncü Sınıf Dövüş Sanatçısı',
			'nl': 'Derderangs Krijgskunstenaar',
			'pl': 'Wojownik Trzeciej Klasy',
			'hi': 'तृतीय श्रेणी का योद्धा (Third-rate Martial Artist)',
			'uk': 'Майстер Третього Рангу',
			'sv': 'Tredjerangs Kampsportare',
			'fi': 'Kolmannen Luokan Kamppailija'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Intermediate martial artist capable of circulating basic internal Qi through primary meridians.',
		translations: {
			'zh-Hans': '二流高手',
			'zh-Hant': '二流高手',
			'en': 'Second-rate Martial Artist',
			'ja': '二流武芸者',
			'ko': '이류',
			'es': 'Artista Marcial de Segunda',
			'fr': 'Artiste Martial de Second Ordre',
			'de': 'Zweitklassiger Kampfkünstler',
			'ru': 'Мастер Второго Ранга',
			'pt': 'Artista Marcial de Segunda Classe',
			'it': 'Artista Marziale di Seconda Classe',
			'id': 'Pendekar Kelas Dua',
			'th': 'จอมยุทธ์ชั้นสอง',
			'tr': 'İkinci Sınıf Dövüş Sanatçısı',
			'nl': 'Tweederangs Krijgskunstenaar',
			'pl': 'Wojownik Drugiej Klasy',
			'hi': 'द्वितीय श्रेणी का योद्धा (Second-rate Martial Artist)',
			'uk': 'Майстер Другого Рангу',
			'sv': 'Andrarangs Kampsportare',
			'fi': 'Toisen Luokan Kamppailija'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Advanced master who has opened all twelve standard meridians and wields potent internal power.',
		translations: {
			'zh-Hans': '一流高手',
			'zh-Hant': '一流高手',
			'en': 'First-rate Martial Artist',
			'ja': '一流武芸者',
			'ko': '일류',
			'es': 'Artista Marcial de Primera',
			'fr': 'Artiste Martial de Premier Ordre',
			'de': 'Erstklassiger Kampfkünstler',
			'ru': 'Мастер Первого Ранга',
			'pt': 'Artista Marcial de Primeira Classe',
			'it': 'Artista Marziale di Prima Classe',
			'id': 'Pendekar Kelas Satu',
			'th': 'จอมยุทธ์ชั้นหนึ่ง',
			'tr': 'Birinci Sınıf Dövüş Sanatçısı',
			'nl': 'Eersterangs Krijgskunstenaar',
			'pl': 'Wojownik Pierwszej Klasy',
			'hi': 'प्रथम श्रेणी का योद्धा (First-rate Martial Artist)',
			'uk': 'Майстер Першого Рангу',
			'sv': 'Försterangs Kampsportare',
			'fi': 'Ensimmäisen Luokan Kamppailija'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Peak master capable of projecting visible Sword Qi (Qijian) beyond physical blades.',
		translations: {
			'zh-Hans': '绝顶高手',
			'zh-Hant': '絕頂高手',
			'en': 'Peak Master',
			'ja': '絶頂の達人',
			'ko': '절정',
			'es': 'Maestro de la Cima',
			'fr': 'Maître du Sommet',
			'de': 'Spitzenmeister',
			'ru': 'Пиковый Мастер',
			'pt': 'Mestre do Ápice',
			'it': 'Maestro del Culmine',
			'id': 'Pendekar Puncak',
			'th': 'ปรมาจารย์ขั้นสุดยอด',
			'tr': 'Zirve Ustası',
			'nl': 'Piekmeester',
			'pl': 'Mistrz Szczytu',
			'hi': 'सर्वोच्च मास्टर (Peak Master)',
			'uk': 'Піковий Майстер',
			'sv': 'Toppmästare',
			'fi': 'Huippumestari'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Supreme peak realm; masters wielding dense Sword Gang aura and profound domain awareness.',
		translations: {
			'zh-Hans': '超绝顶',
			'zh-Hant': '超絕頂',
			'en': 'Transcendent Master',
			'ja': '超絶頂の達人',
			'ko': '초절정',
			'es': 'Maestro Trascendente',
			'fr': 'Maître Transcendant',
			'de': 'Transzendenter Meister',
			'ru': 'Трансцендентный Мастер',
			'pt': 'Mestre Transcendente',
			'it': 'Maestro Trascendente',
			'id': 'Pendekar Transenden',
			'th': 'ปรมาจารย์ขั้นเหนือยอด',
			'tr': 'Aşkın Usta',
			'nl': 'Transcendente Meester',
			'pl': 'Transcendentalny Mistrz',
			'hi': 'उत्कृष्ट मास्टर (Transcendent Master)',
			'uk': 'Трансцендентний Майстер',
			'sv': 'Transcendental Mästare',
			'fi': 'Yliluonnollinen Mestari'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Transformation realm where internal energy seamlessly unifies with natural atmospheric Qi.',
		translations: {
			'zh-Hans': '化境',
			'zh-Hant': '化境',
			'en': 'Transformation Realm',
			'ja': '化境',
			'ko': '화경',
			'es': 'Reino de la Transformación',
			'fr': 'Royaume de la Transformation',
			'de': 'Transformations-Reich',
			'ru': 'Царство Трансформации',
			'pt': 'Reino da Transformação',
			'it': 'Regno della Trasformazione',
			'id': 'Ranah Transformasi',
			'th': 'แดนแปรเปลี่ยน (ฮวากย็อง)',
			'tr': 'Dönüşüm Âlemi',
			'nl': 'Transformatierijk',
			'pl': 'Sfera Transformacji',
			'hi': 'रूपांतरण क्षेत्र (Transformation Realm)',
			'uk': 'Царство Трансформації',
			'sv': 'Transformationsriket',
			'fi': 'Muodonmuutoksen Valtakunta'
		}
	},
	{
		theme: 'murim',
		category: 'realm',
		gender: 'neuter',
		context: 'Profound realm; legendary pinnacle of human martial cultivation touching celestial laws.',
		translations: {
			'zh-Hans': '玄境',
			'zh-Hant': '玄境',
			'en': 'Profound Realm',
			'ja': '玄境',
			'ko': '현경',
			'es': 'Reino Profundo',
			'fr': 'Royaume Profond',
			'de': 'Tiefgründiges Reich',
			'ru': 'Глубокое Царство',
			'pt': 'Reino Profundo',
			'it': 'Regno Profondo',
			'id': 'Ranah Mendalam',
			'th': 'แดนลึกล้ำ (ฮย็อนกย็อง)',
			'tr': 'Derin Âlem',
			'nl': 'Diepgaand Rijk',
			'pl': 'Głęboka Sfera',
			'hi': 'गहन क्षेत्र (Profound Realm)',
			'uk': 'Глибоке Царство',
			'sv': 'Det Djupa Riket',
			'fi': 'Syvällinen Valtakunta'
		}
	},

	// =========================================================================
	// 3. HUNTER & SYSTEM LEVELING RANKS
	// =========================================================================
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Transcendent hunter rank surpassing ordinary measurements; god-tier combat power.',
		translations: {
			'zh-Hans': 'SSS级',
			'zh-Hant': 'SSS級',
			'en': 'SSS-Rank',
			'ja': 'SSSランク',
			'ko': 'SSS급',
			'es': 'Rango SSS',
			'fr': 'Rang SSS',
			'de': 'SSS-Rang',
			'ru': 'SSS-Ранг',
			'pt': 'Rank SSS',
			'it': 'Rango SSS',
			'id': 'Peringkat SSS',
			'th': 'ระดับ SSS',
			'tr': 'SSS-Sıralaması',
			'nl': 'SSS-Klasse',
			'pl': 'Ranga SSS',
			'hi': 'एसएसएस-रैंक (SSS-Rank)',
			'uk': 'SSS-Ранг',
			'sv': 'SSS-Rang',
			'fi': 'SSS-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Exceptional hunter rank just below transcendent status; capable of clearing catastrophic red gates.',
		translations: {
			'zh-Hans': 'SS级',
			'zh-Hant': 'SS級',
			'en': 'SS-Rank',
			'ja': 'SSランク',
			'ko': 'SS급',
			'es': 'Rango SS',
			'fr': 'Rang SS',
			'de': 'SS-Rang',
			'ru': 'SS-Ранг',
			'pt': 'Rank SS',
			'it': 'Rango SS',
			'id': 'Peringkat SS',
			'th': 'ระดับ SS',
			'tr': 'SS-Sıralaması',
			'nl': 'SS-Klasse',
			'pl': 'Ranga SS',
			'hi': 'एसएस-रैंक (SS-Rank)',
			'uk': 'SS-Ранг',
			'sv': 'SS-Rang',
			'fi': 'SS-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Highest standard hunter tier designated for country-level or calamity-level combatants.',
		translations: {
			'zh-Hans': 'S级',
			'zh-Hant': 'S級',
			'en': 'S-Rank',
			'ja': 'Sランク',
			'ko': 'S급',
			'es': 'Rango S',
			'fr': 'Rang S',
			'de': 'S-Rang',
			'ru': 'S-Ранг',
			'pt': 'Rank S',
			'it': 'Rango S',
			'id': 'Peringkat S',
			'th': 'ระดับ S',
			'tr': 'S-Sıralaması',
			'nl': 'S-Klasse',
			'pl': 'Ranga S',
			'hi': 'एस-रैंक (S-Rank)',
			'uk': 'S-Ранг',
			'sv': 'S-Rang',
			'fi': 'S-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'High-tier hunter rank serving as frontline raid leaders and guild executives.',
		translations: {
			'zh-Hans': 'A级',
			'zh-Hant': 'A級',
			'en': 'A-Rank',
			'ja': 'Aランク',
			'ko': 'A급',
			'es': 'Rango A',
			'fr': 'Rang A',
			'de': 'A-Rang',
			'ru': 'A-Ранг',
			'pt': 'Rank A',
			'it': 'Rango A',
			'id': 'Peringkat A',
			'th': 'ระดับ A',
			'tr': 'A-Sıralaması',
			'nl': 'A-Klasse',
			'pl': 'Ranga A',
			'hi': 'ए-रैंक (A-Rank)',
			'uk': 'A-Ранг',
			'sv': 'A-Rang',
			'fi': 'A-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Upper-middle hunter rank forming the core assault force for difficult dungeon gates.',
		translations: {
			'zh-Hans': 'B级',
			'zh-Hant': 'B級',
			'en': 'B-Rank',
			'ja': 'Bランク',
			'ko': 'B급',
			'es': 'Rango B',
			'fr': 'Rang B',
			'de': 'B-Rang',
			'ru': 'B-Ранг',
			'pt': 'Rank B',
			'it': 'Rango B',
			'id': 'Peringkat B',
			'th': 'ระดับ B',
			'tr': 'B-Sıralaması',
			'nl': 'B-Klasse',
			'pl': 'Ranga B',
			'hi': 'बी-रैंक (B-Rank)',
			'uk': 'B-Ранг',
			'sv': 'B-Rang',
			'fi': 'B-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Middle-tier hunter rank capable of clearing standard gates in coordinated strike parties.',
		translations: {
			'zh-Hans': 'C级',
			'zh-Hant': 'C級',
			'en': 'C-Rank',
			'ja': 'Cランク',
			'ko': 'C급',
			'es': 'Rango C',
			'fr': 'Rang C',
			'de': 'C-Rang',
			'ru': 'C-Ранг',
			'pt': 'Rank C',
			'it': 'Rango C',
			'id': 'Peringkat C',
			'th': 'ระดับ C',
			'tr': 'C-Sıralaması',
			'nl': 'C-Klasse',
			'pl': 'Ranga C',
			'hi': 'सी-रैंक (C-Rank)',
			'uk': 'C-Ранг',
			'sv': 'C-Rang',
			'fi': 'C-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Lower-middle hunter rank suited for dungeon portering, mining, and basic monster subjugation.',
		translations: {
			'zh-Hans': 'D级',
			'zh-Hant': 'D級',
			'en': 'D-Rank',
			'ja': 'Dランク',
			'ko': 'D급',
			'es': 'Rango D',
			'fr': 'Rang D',
			'de': 'D-Rang',
			'ru': 'D-Ранг',
			'pt': 'Rank D',
			'it': 'Rango D',
			'id': 'Peringkat D',
			'th': 'ระดับ D',
			'tr': 'D-Sıralaması',
			'nl': 'D-Klasse',
			'pl': 'Ranga D',
			'hi': 'डी-रैंक (D-Rank)',
			'uk': 'D-Ранг',
			'sv': 'D-Rang',
			'fi': 'D-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Low-tier entry hunter rank with minor magical awakening; the standard starting grade.',
		translations: {
			'zh-Hans': 'E级',
			'zh-Hant': 'E級',
			'en': 'E-Rank',
			'ja': 'Eランク',
			'ko': 'E급',
			'es': 'Rango E',
			'fr': 'Rang E',
			'de': 'E-Rang',
			'ru': 'E-Ранг',
			'pt': 'Rank E',
			'it': 'Rango E',
			'id': 'Peringkat E',
			'th': 'ระดับ E',
			'tr': 'E-Sıralaması',
			'nl': 'E-Klasse',
			'pl': 'Ranga E',
			'hi': 'ई-रैंक (E-Rank)',
			'uk': 'E-Ранг',
			'sv': 'E-Rang',
			'fi': 'E-Taso'
		}
	},
	{
		theme: 'system',
		category: 'realm',
		gender: 'neuter',
		context: 'Lowest tier hunter ranking with minimal magic power and basic physical enhancement.',
		translations: {
			'zh-Hans': 'F级',
			'zh-Hant': 'F級',
			'en': 'F-Rank',
			'ja': 'Fランク',
			'ko': 'F급',
			'es': 'Rango F',
			'fr': 'Rang F',
			'de': 'F-Rang',
			'ru': 'F-Ранг',
			'pt': 'Rank F',
			'it': 'Rango F',
			'id': 'Peringkat F',
			'th': 'ระดับ F',
			'tr': 'F-Sıralaması',
			'nl': 'F-Klasse',
			'pl': 'Ranga F',
			'hi': 'एफ-रैंक (F-Rank)',
			'uk': 'F-Ранг',
			'sv': 'F-Rang',
			'fi': 'F-Taso'
		}
	},
	{
		theme: 'system',
		category: 'title',
		gender: 'masculine',
		context: 'Pinnacle hunter whose single-handed destructive military capability equals that of an entire nation.',
		translations: {
			'zh-Hans': '国家级猎人',
			'zh-Hant': '國家級獵人',
			'en': 'National Level Hunter',
			'ja': '国家権力級ハンター',
			'ko': '국가권력급 헌터',
			'es': 'Cazador de Nivel Nacional',
			'fr': 'Chasseur de Niveau National',
			'de': 'Jäger auf Nationaler Ebene',
			'ru': 'Охотник Национального Уровня',
			'pt': 'Caçador de Nível Nacional',
			'it': 'Cacciatore di Livello Nazionale',
			'id': 'Hunter Tingkat Nasional',
			'th': 'ฮันเตอร์ระดับชาติ',
			'tr': 'Ulusal Seviye Avcı',
			'nl': 'Jager op Nationaal Niveau',
			'pl': 'Łowca Poziomu Narodowego',
			'hi': 'राष्ट्रीय स्तर का शिकारी (National Level Hunter)',
			'uk': 'Мисливець Національного Рівня',
			'sv': 'Jägare på Nationell Nivå',
			'fi': 'Kansallisen Tason Metsästäjä'
		}
	},

	// =========================================================================
	// 4. ROYAL & NOBILITY PEERAGE (ROFAN & PALACE)
	// =========================================================================
	{
		theme: 'rofan',
		category: 'title',
		gender: 'masculine',
		context: 'High noble rank of Marquess; governor and defender of border marches.',
		translations: {
			'zh-Hans': '侯爵',
			'zh-Hant': '侯爵',
			'en': 'Marquess',
			'ja': '侯爵',
			'ko': '후작',
			'es': 'Marqués',
			'fr': 'Marquis',
			'de': 'Markgraf',
			'ru': 'Маркиз',
			'pt': 'Marquês',
			'it': 'Marchese',
			'id': 'Marquess',
			'th': 'มาร์ควิส',
			'tr': 'Marki',
			'nl': 'Markies',
			'pl': 'Margrabia',
			'hi': 'मार्क्विस (Marquess)',
			'uk': 'Маркіз',
			'sv': 'Markis',
			'fi': 'Markiisi'
		}
	},
	{
		theme: 'rofan',
		category: 'title',
		gender: 'masculine',
		context: 'Mid-tier landed noble rank below Marquess and above Viscount.',
		translations: {
			'zh-Hans': '伯爵',
			'zh-Hant': '伯爵',
			'en': 'Count',
			'ja': '伯爵',
			'ko': '백작',
			'es': 'Conde',
			'fr': 'Comte',
			'de': 'Graf',
			'ru': 'Граф',
			'pt': 'Conde',
			'it': 'Conte',
			'id': 'Count',
			'th': 'เคานต์',
			'tr': 'Kont',
			'nl': 'Graaf',
			'pl': 'Hrabia',
			'hi': 'काउंट (Count)',
			'uk': 'Граф',
			'sv': 'Greve',
			'fi': 'Kreivi'
		}
	},
	{
		theme: 'rofan',
		category: 'title',
		gender: 'masculine',
		context: 'Noble rank positioned between Count and Baron.',
		translations: {
			'zh-Hans': '子爵',
			'zh-Hant': '子爵',
			'en': 'Viscount',
			'ja': '子爵',
			'ko': '자작',
			'es': 'Vizconde',
			'fr': 'Vicomte',
			'de': 'Vizegraf',
			'ru': 'Виконт',
			'pt': 'Visconde',
			'it': 'Visconte',
			'id': 'Viscount',
			'th': 'ไวเคานต์',
			'tr': 'Vikont',
			'nl': 'Burggraaf',
			'pl': 'Wicehrabia',
			'hi': 'विस्काउंट (Viscount)',
			'uk': 'Віконт',
			'sv': 'Vikomt',
			'fi': 'Varakreivi'
		}
	},
	{
		theme: 'rofan',
		category: 'title',
		gender: 'masculine',
		context: 'Lowest rank of the landed peerage nobility.',
		translations: {
			'zh-Hans': '男爵',
			'zh-Hant': '男爵',
			'en': 'Baron',
			'ja': '男爵',
			'ko': '남작',
			'es': 'Barón',
			'fr': 'Baron',
			'de': 'Baron',
			'ru': 'Барон',
			'pt': 'Barão',
			'it': 'Barone',
			'id': 'Baron',
			'th': 'บารอน',
			'tr': 'Baron',
			'nl': 'Baron',
			'pl': 'Baron',
			'hi': 'बैरन (Baron)',
			'uk': 'Барон',
			'sv': 'Baron',
			'fi': 'Paroni'
		}
	},
	{
		theme: 'rofan',
		category: 'title',
		gender: 'masculine',
		context: 'Supreme commander of the royal chivalric knight order.',
		translations: {
			'zh-Hans': '骑士团长',
			'zh-Hant': '騎士團長',
			'en': 'Knight Commander',
			'ja': '騎士団長',
			'ko': '기사단장',
			'es': 'Comandante de Caballeros',
			'fr': 'Commandant des Chevaliers',
			'de': 'Ritterkommandant',
			'ru': 'Командор Рыцарей',
			'pt': 'Comandante dos Cavaleiros',
			'it': 'Comandante dei Cavalieri',
			'id': 'Komandan Ksatria',
			'th': 'ผู้บัญชาการอัศวิน',
			'tr': 'Şövalye Komutanı',
			'nl': 'Riddercommandant',
			'pl': 'Dowódca Rycerzy',
			'hi': 'नाइट कमांडर (Knight Commander)',
			'uk': 'Командор Лицарів',
			'sv': 'Riddarkommendör',
			'fi': 'Ritarikomentaja'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'feminine',
		context: 'Highest imperial harem consort rank directly beneath the Empress.',
		translations: {
			'zh-Hans': '皇贵妃',
			'zh-Hant': '皇貴妃',
			'en': 'Imperial Noble Consort',
			'ja': '皇貴妃',
			'ko': '황귀비',
			'es': 'Consorte Noble Imperial',
			'fr': 'Noble Consort Impériale',
			'de': 'Kaiserliche Edelkonsortin',
			'ru': 'Императорская Благородная Супруга',
			'pt': 'Nobre Consorte Imperial',
			'it': 'Nobile Consorte Imperiale',
			'id': 'Selir Mulia Kekaisaran',
			'th': 'หวงกุ้ยเฟย',
			'tr': 'İmparatorluk Soylu Eşi',
			'nl': 'Keizerlijke Edele Gemalin',
			'pl': 'Cesarska Szlachetna Małżonka',
			'hi': 'शाही नोबल कंसोर्ट (Imperial Noble Consort)',
			'uk': 'Імператорська Благородна Дружина',
			'sv': 'Kejserlig Ädelgemål',
			'fi': 'Keisarillinen Jalo Puoliso'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'feminine',
		context: 'High-ranking imperial palace concubine enjoying senior court privileges.',
		translations: {
			'zh-Hans': '贵妃',
			'zh-Hant': '貴妃',
			'en': 'Noble Consort',
			'ja': '貴妃',
			'ko': '귀비',
			'es': 'Noble Consorte',
			'fr': 'Noble Consort',
			'de': 'Edelkonsortin',
			'ru': 'Благородная Супруга',
			'pt': 'Nobre Consorte',
			'it': 'Nobile Consorte',
			'id': 'Selir Mulia',
			'th': 'กุ้ยเฟย',
			'tr': 'Soylu Eş',
			'nl': 'Edele Gemalin',
			'pl': 'Szlachetna Małżonka',
			'hi': 'नोबल कंसोर्ट (Noble Consort)',
			'uk': 'Благородна Дружина',
			'sv': 'Ädelgemål',
			'fi': 'Jalo Puoliso'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Imperial prince of the first rank; brother or son of the reigning Emperor.',
		translations: {
			'zh-Hans': '亲王',
			'zh-Hant': '親王',
			'en': 'Imperial Prince',
			'ja': '親王',
			'ko': '친왕',
			'es': 'Príncipe Imperial',
			'fr': 'Prince Impérial',
			'de': 'Kaiserlicher Prinz',
			'ru': 'Императорский Принц',
			'pt': 'Príncipe Imperial',
			'it': 'Principe Imperiale',
			'id': 'Pangeran Kekaisaran',
			'th': 'ชินอ๋อง',
			'tr': 'İmparatorluk Prensi',
			'nl': 'Keizerlijke Prins',
			'pl': 'Książę Cesarski',
			'hi': 'शाही राजकुमार (Imperial Prince)',
			'uk': 'Імператорський Принц',
			'sv': 'Kejserlig Prins',
			'fi': 'Keisarillinen Prinssi'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'feminine',
		context: 'Official wife and primary consort of the Crown Prince.',
		translations: {
			'zh-Hans': '太子妃',
			'zh-Hant': '太子妃',
			'en': 'Crown Princess',
			'ja': '皇太子妃',
			'ko': '태자비',
			'es': 'Princesa Heredera',
			'fr': 'Princesse Héritière',
			'de': 'Kronprinzessin',
			'ru': 'Кронпринцесса',
			'pt': 'Princesa Herdeira',
			'it': 'Principessa Ereditaria',
			'id': 'Putri Mahkota',
			'th': 'พระชายารัชทายาท',
			'tr': 'Veliaht Prenses',
			'nl': 'Kroonprinses',
			'pl': 'Następczyni Tronu',
			'hi': 'युवराज्ञी (Crown Princess)',
			'uk': 'Кронпринцеса',
			'sv': 'Kronprinsessa',
			'fi': 'Kruununprinsessa'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'feminine',
		context: 'Palace maid or female attendant serving within the imperial residence.',
		translations: {
			'zh-Hans': '宫女',
			'zh-Hant': '宮女',
			'en': 'Palace Maid',
			'ja': '宮女',
			'ko': '궁녀',
			'es': 'Doncella del Palacio',
			'fr': 'Servante du Palais',
			'de': 'Palastmagd',
			'ru': 'Дворцовая Служанка',
			'pt': 'Dama do Palácio',
			'it': 'Ancella di Palazzo',
			'id': 'Dayang Istana',
			'th': 'นางในวัง',
			'tr': 'Saray Hizmetçisi',
			'nl': 'Paleismeid',
			'pl': 'Dworzanka',
			'hi': 'महल की दासी (Palace Maid)',
			'uk': 'Палацова Служниця',
			'sv': 'Palatspiga',
			'fi': 'Palatsin Sisäkkö'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Head eunuch holding supreme administrative authority over internal imperial palace affairs.',
		translations: {
			'zh-Hans': '大太监',
			'zh-Hant': '大太監',
			'en': 'Chief Eunuch',
			'ja': '大太監',
			'ko': '대태감',
			'es': 'Gran Eunuco',
			'fr': 'Grand Eunuque',
			'de': 'Großeunuch',
			'ru': 'Главный Евнух',
			'pt': 'Grande Eunuco',
			'it': 'Gran Eunuco',
			'id': 'Kasim Kepala',
			'th': 'หัวหน้าขันที',
			'tr': 'Baş Hadım',
			'nl': 'Oppereunuch',
			'pl': 'Główny Eunuch',
			'hi': 'मुख्य हिजड़ा/सेवक (Chief Eunuch)',
			'uk': 'Головний Євнух',
			'sv': 'Övereunuck',
			'fi': 'Pääeunukki'
		}
	},

	// =========================================================================
	// 5. IMPERIAL ARMY & MILITARY COMMAND RANKS
	// =========================================================================
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Supreme commander of the imperial military forces; Grand Marshal (Da Sima).',
		translations: {
			'zh-Hans': '大司马',
			'zh-Hant': '大司馬',
			'en': 'Grand Marshal',
			'ja': '大司馬',
			'ko': '대사마',
			'es': 'Gran Mariscal',
			'fr': 'Grand Maréchal',
			'de': 'Großmarschall',
			'ru': 'Великий Маршал',
			'pt': 'Grão-Marechal',
			'it': 'Gran Maresciallo',
			'id': 'Marsekal Agung',
			'th': 'แม่ทัพสูงสุด (ต้าซือหม่า)',
			'tr': 'Büyük Mareşal',
			'nl': 'Grootmaarschalk',
			'pl': 'Wielki Marszałek',
			'hi': 'प्रधान सेनापति (Grand Marshal)',
			'uk': 'Великий Маршал',
			'sv': 'Fältmarskalk',
			'fi': 'Suurmarsalkka'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Supreme general commanding the empire field armies (Da Jiangjun).',
		translations: {
			'zh-Hans': '大将军',
			'zh-Hant': '大將軍',
			'en': 'General-in-Chief',
			'ja': '大将軍',
			'ko': '대장군',
			'es': 'General en Jefe',
			'fr': 'Général en Chef',
			'de': 'Oberbefehlshaber',
			'ru': 'Генералиссимус',
			'pt': 'General-em-Chefe',
			'it': 'Generale in Capo',
			'id': 'Jenderal Utama',
			'th': 'แม่ทัพใหญ่ (ต้าเจียงจวิน)',
			'tr': 'Başkomutan',
			'nl': 'Opperbevelhebber',
			'pl': 'Naczelny Wódz',
			'hi': 'मुख्य सेनापति (General-in-Chief)',
			'uk': 'Головнокомандувач',
			'sv': 'Överbefälhavare',
			'fi': 'Ylipäällikkö'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Area commander-in-chief or military governor governing provincial troop divisions (Dudu).',
		translations: {
			'zh-Hans': '都督',
			'zh-Hant': '都督',
			'en': 'Military Governor',
			'ja': '都督',
			'ko': '도독',
			'es': 'Gobernador Militar',
			'fr': 'Gouverneur Militaire',
			'de': 'Militärgouverneur',
			'ru': 'Военный Губернатор',
			'pt': 'Governador Militar',
			'it': 'Governatore Militare',
			'id': 'Gubernur Militer (Dudu)',
			'th': 'ผู้ว่าการทหาร (ตูตู)',
			'tr': 'Askeri Vali',
			'nl': 'Militair Gouverneur',
			'pl': 'Gubernator Wojskowy',
			'hi': 'सैन्य राज्यपाल (Military Governor)',
			'uk': 'Військовий Губернатор',
			'sv': 'Militärguvernör',
			'fi': 'Sotilaskuvernööri'
		}
	},
	{
		theme: 'palace',
		category: 'organization',
		gender: 'neuter',
		context: 'Elite imperial bodyguard secret intelligence agency in embroidered uniforms (Jinyiwei).',
		translations: {
			'zh-Hans': '锦衣卫',
			'zh-Hant': '錦衣衛',
			'en': 'Embroidered Uniform Guard',
			'ja': '錦衣衛',
			'ko': '금의위',
			'es': 'Guardia de Uniforme Bordado',
			'fr': 'Garde aux Uniformes Brodés',
			'de': 'Bestickte Uniform-Garde',
			'ru': 'Стража в Вышитых Халатах',
			'pt': 'Guarda dos Uniformes Bordados',
			'it': 'Guardia in Uniforme Ricamata',
			'id': 'Pengawal Berseragam Bordir (Jinyiwei)',
			'th': 'องครักษ์เสื้อแพร (จิ่นอีเว่ย)',
			'tr': 'İşlemeli Üniforma Muhafızları',
			'nl': 'Geborduurde Uniformgarde',
			'pl': 'Gwardia Haftowanych Szat',
			'hi': 'कशीदाकारी वर्दी गार्ड (Jinyiwei)',
			'uk': 'Варта у Вишитих Халатах',
			'sv': 'Broderade Uniformgardet',
			'fi': 'Kirjailtujen Pukujen Kaarti'
		}
	},
	{
		theme: 'palace',
		category: 'organization',
		gender: 'neuter',
		context: 'Elite imperial guard tasked with protecting the palace gates and the Emperor (Jinwei).',
		translations: {
			'zh-Hans': '禁军',
			'zh-Hant': '禁軍',
			'en': 'Imperial Guard',
			'ja': '禁軍',
			'ko': '금군',
			'es': 'Guardia Imperial',
			'fr': 'Garde Impériale',
			'de': 'Kaiserliche Garde',
			'ru': 'Императорская Гвардия',
			'pt': 'Guarda Imperial',
			'it': 'Guardia Imperiale',
			'id': 'Pasukan Pengawal Kekaisaran',
			'th': 'กองทหารรักษาพระองค์ (จิ้นจวิน)',
			'tr': 'İmparatorluk Muhafızları',
			'nl': 'Keizerlijke Garde',
			'pl': 'Gwardia Cesarska',
			'hi': 'शाही गार्ड (Imperial Guard)',
			'uk': 'Імператорська Гвардія',
			'sv': 'Kejserliga Gardet',
			'fi': 'Keisarillinen Kaarti'
		}
	},
	{
		theme: 'palace',
		category: 'title',
		gender: 'masculine',
		context: 'Commander of a hundred soldiers in imperial field formations (Baifuzhang).',
		translations: {
			'zh-Hans': '百夫长',
			'zh-Hant': '百夫長',
			'en': 'Centurion',
			'ja': '百人隊長',
			'ko': '백부장',
			'es': 'Centurión',
			'fr': 'Centurion',
			'de': 'Zenturio',
			'ru': 'Сотник',
			'pt': 'Centurião',
			'it': 'Centurione',
			'id': 'Komandan Pasukan Seratus',
			'th': 'นายกองร้อย (ไป่ฟูจ่าง)',
			'tr': 'Yüzbaşı',
			'nl': 'Centurio',
			'pl': 'Setnik',
			'hi': 'शतपति (Centurion)',
			'uk': 'Сотник',
			'sv': 'Centurion',
			'fi': 'Sadanpäämies'
		}
	}
];

for (const entry of newEntries) {
	const key = `${entry.theme}::${entry.translations.en}`;
	uniqueEntitiesMap.set(key, entry);
}

const combinedEntities = Array.from(uniqueEntitiesMap.values());
console.log(`Total master entities combined: ${combinedEntities.length}`);

// Output directories
const PACKS_DIR = path.resolve(__dirname, '../web/src/lib/server/glossary-packs/data');
if (!fs.existsSync(PACKS_DIR)) {
	fs.mkdirSync(PACKS_DIR, { recursive: true });
}

// Generate individual packs and compile the manifest
const manifest = {};
let packCount = 0;

for (const sourceLang of LANGUAGES) {
	for (const targetLang of LANGUAGES) {
		if (sourceLang === targetLang) continue;

		for (const theme of THEMES) {
			const packKey = `${sourceLang}-${targetLang}-${theme}`;
			const themeEntities = combinedEntities.filter(e => e.theme === theme);

			const terms = themeEntities.map(entity => {
				const source = entity.translations[sourceLang] || entity.translations['en'] || entity.translations['zh-Hans'];
				const target = entity.translations[targetLang] || entity.translations['en'] || entity.translations['zh-Hans'];
				
				// Build aliases from other major language translations to boost detection matching
				const aliases = Object.values(entity.translations).filter(v => v && v !== source && v !== target);
				// Deduplicate aliases
				const uniqueAliases = Array.from(new Set(aliases));

				return {
					source,
					target,
					category: entity.category,
					gender: entity.gender,
					aliases: uniqueAliases,
					context: entity.context,
					pinned: false
				};
			});

			manifest[packKey] = terms;
			const filePath = path.join(PACKS_DIR, `${packKey}.json`);
			fs.writeFileSync(filePath, JSON.stringify(terms, null, '\t'), 'utf8');
			packCount++;
		}
	}
}

// Save precompiled manifest
const manifestPath = path.join(PACKS_DIR, 'packs-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest), 'utf8');
console.log(`Successfully compiled ${packCount} pack JSON files and generated packs-manifest.json (${(fs.statSync(manifestPath).size / 1024 / 1024).toFixed(2)} MB)`);

// Save updated master dataset for version control
fs.writeFileSync(masterEntitiesPath, JSON.stringify(combinedEntities, null, 2), 'utf8');
