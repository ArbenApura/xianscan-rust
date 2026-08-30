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

const combinedEntities = Array.from(uniqueEntitiesMap.values());
console.log(`Total master entities: ${combinedEntities.length}`);

// Output directories
const PACKS_DATA_DIR = path.resolve(__dirname, '../web/src/lib/server/glossary-packs/data');
if (!fs.existsSync(PACKS_DATA_DIR)) {
	fs.mkdirSync(PACKS_DATA_DIR, { recursive: true });
}

// Clean old bulky individual JSON pack files if they exist
const files = fs.readdirSync(PACKS_DATA_DIR);
for (const file of files) {
	if (file.endsWith('.json')) {
		fs.unlinkSync(path.join(PACKS_DATA_DIR, file));
	}
}

// 1. Write the lean master dictionary JSON (~111 KB)
const masterDictionaryPath = path.join(PACKS_DATA_DIR, 'master-glossary.json');
fs.writeFileSync(masterDictionaryPath, JSON.stringify(combinedEntities), 'utf8');
const masterSizeKB = (fs.statSync(masterDictionaryPath).size / 1024).toFixed(2);
console.log(`Successfully generated master-glossary.json (${masterSizeKB} KB)`);

// 2. Also save to scripts/ for source tracking
fs.writeFileSync(masterEntitiesPath, JSON.stringify(combinedEntities, null, 2), 'utf8');
