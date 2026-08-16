// MOCK DEEPSEEK — A TINY OPENAI-COMPATIBLE /chat/completions SERVER FOR LOCAL END-TO-END TESTING
// WITHOUT AN API KEY. IT "TRANSLATES" EVERY REGION ID IT FINDS IN THE USER MESSAGE TO A FIXED STRING,
// SO THE WHOLE PIPELINE (DETECT → OCR → TRANSLATE → CLEAN → TYPESET) CAN BE EXERCISED LIVE.
//
//   node scripts/mock-llm.mjs [port=8010]
//   # THEN SET DEEPSEEK_BASE_URL=http://127.0.0.1:8010 IN web/.env
import { createServer } from 'node:http';

const port = Number(process.argv[2] ?? 8010);

const server = createServer((req, res) => {
	let body = '';
	req.on('data', (c) => (body += c));
	req.on('end', () => {
		let payload = {};
		try {
			payload = JSON.parse(body || '{}');
		} catch {
			// IGNORE — THE FALLBACK BELOW HANDLES IT
		}
		// FIND THE REGION IDS IN THE USER MESSAGE ("id": "r0") AND "TRANSLATE" EACH
		const userMsg = (payload.messages ?? []).find((m) => m.role === 'user')?.content ?? '';
		const ids = [...userMsg.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]);
		const translation = Object.fromEntries(ids.map((id, i) => [id, i % 2 === 0 ? 'Hello there!' : 'BOOM!']));
		res.writeHead(200, { 'content-type': 'application/json' });
		res.end(
			JSON.stringify({
				id: 'mock-1',
				object: 'chat.completion',
				model: payload.model ?? 'deepseek-v4-flash',
				choices: [{ index: 0, message: { role: 'assistant', content: JSON.stringify(translation) } }],
				usage: { prompt_tokens: 120, completion_tokens: 30, total_tokens: 150 },
			}),
		);
	});
});

server.listen(port, '127.0.0.1', () => {
	console.log(`mock DeepSeek listening on http://127.0.0.1:${port}`);
});
