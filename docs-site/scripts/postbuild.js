import fs from 'node:fs';
import path from 'node:path';

// POST-BUILD SCRIPT TO ENSURE 404 FALLBACK CARRIES NOINDEX DIRECTIVES
const file404 = path.resolve('build/404.html');
if (fs.existsSync(file404)) {
	let content = fs.readFileSync(file404, 'utf8');
	if (!content.includes('noindex')) {
		content = content.replace('<head>', '<head>\n\t\t<meta name="robots" content="noindex, nofollow" />');
		fs.writeFileSync(file404, content, 'utf8');
		console.log('Successfully injected noindex into build/404.html');
	}
}
