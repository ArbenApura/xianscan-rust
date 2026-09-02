// ==============================================================================
// LIGHTWEIGHT MARKDOWN TO HTML CONVERTER
// Zero-dependency, safe Markdown-to-HTML parser tailored for technical docs.
// Enforces clean table borders, monospaced code blocks, and styled lists.
// ==============================================================================

function escapeHtml(str: string): string {
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
}

export function renderMarkdown(markdown: string): string {
	if (!markdown) return '';

	let output = markdown.trim();
	const placeholders: string[] = [];

	const savePlaceholder = (html: string): string => {
		const idx = placeholders.length;
		placeholders.push(html);
		return `\n\n__DOCS_PLACEHOLDER_${idx}__\n\n`;
	};

	// 1. CODE BLOCKS (```lang ... ```)
	output = output.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (_match, lang, code) => {
		const escapedCode = escapeHtml(code.trim());
		const displayLang = lang ? escapeHtml(lang) : 'code';
		return savePlaceholder(`<div class="my-4 rounded-xl border border-black/10 bg-black/[0.02] dark:border-white/10 dark:bg-white/[0.02] overflow-hidden text-xs">
			<div class="flex items-center justify-between border-b border-black/10 dark:border-white/10 bg-black/5 dark:bg-white/5 px-3 py-1.5 text-[10px] sm:text-[11px] font-mono font-bold uppercase tracking-wider opacity-60">
				<span>${displayLang}</span>
			</div>
			<div class="p-3 sm:p-4 overflow-x-auto font-mono leading-relaxed">
				<pre class="m-0 p-0 whitespace-pre font-mono text-xs"><code>${escapedCode}</code></pre>
			</div>
		</div>`);
	});

	// 2. IMAGES & VIDEOS (![alt](url))
	output = output.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
		const safeSrc = escapeHtml(src.trim());
		const safeAlt = escapeHtml(alt.trim());
		if (safeSrc.endsWith('.mp4') || safeSrc.endsWith('.webm')) {
			return savePlaceholder(`<div class="my-5 overflow-hidden rounded-xl border border-black/10 bg-black shadow-md dark:border-white/10">
				<video src="${safeSrc}" controls playsinline preload="metadata" class="w-full h-auto block"><track kind="captions" /></video>
			</div>`);
		}
		return savePlaceholder(`<div class="my-5 overflow-hidden rounded-xl border border-black/10 bg-black/[0.02] shadow-md dark:border-white/10 dark:bg-white/[0.02]">
			<img src="${safeSrc}" alt="${safeAlt}" class="w-full h-auto block" loading="lazy" />
		</div>`);
	});

	// 3. TABLES (| col1 | col2 |)
	output = output.replace(/((?:^|\n)\|[^\n]+\|\n\|(?:\s*[:-]+[-| :]*\s*)\|\n(?:\|[^\n]+\|\n*)+)/g, (tableBlock) => {
		const lines = tableBlock.trim().split('\n').filter(Boolean);
		if (lines.length < 2) return tableBlock;

		const parseRow = (row: string) =>
			row
				.split('|')
				.slice(1, -1)
				.map((cell) => cell.trim());

		const headers = parseRow(lines[0]);
		const dataRows = lines.slice(2).map(parseRow);

		const thHtml = headers
			.map((h, i) => `<th class="border-b border-black/15 dark:border-white/15 px-4 py-3 text-left font-bold text-[11px] sm:text-xs uppercase tracking-wider opacity-85 ${i === 0 ? 'whitespace-nowrap' : 'min-w-[140px]'}">${renderInline(h)}</th>`)
			.join('');

		const tbHtml = dataRows
			.map(
				(row) =>
					`<tr class="border-b border-black/5 dark:border-white/5 transition-colors hover:bg-black/[0.025] dark:hover:bg-white/[0.025] even:bg-black/[0.01] dark:even:bg-white/[0.01]">${row
						.map((cell, i) => `<td class="px-4 py-3 align-top text-xs leading-relaxed opacity-90 break-words ${i === 0 ? 'font-medium whitespace-nowrap text-[#1a1a1a] dark:text-[#f0f0f0]' : ''}">${renderInline(cell)}</td>`)
						.join('')}</tr>`,
			)
			.join('');

		return savePlaceholder(`<div class="my-5 w-full overflow-x-auto rounded-xl border border-black/10 bg-black/[0.01] shadow-sm dark:border-white/10 dark:bg-white/[0.01]"><table class="w-full min-w-[560px] border-collapse text-left text-xs sm:text-sm"><thead class="bg-black/5 dark:bg-white/5"><tr>${thHtml}</tr></thead><tbody>${tbHtml}</tbody></table></div>`);
	});

	// 4. HORIZONTAL RULES (---, ___, ***)
	output = output.replace(/^(?:---|___|\*\*\*)$/gm, () => {
		return savePlaceholder('<hr class="my-6 border-0 border-t border-black/10 dark:border-white/10" />');
	});

	// 5. HEADINGS
	output = output.replace(/^#### (.*?)$/gm, (_m, h) => savePlaceholder(`<h4 class="mt-6 mb-2 text-sm font-bold tracking-tight">${renderInline(h)}</h4>`));
	output = output.replace(/^### (.*?)$/gm, (_m, h) => savePlaceholder(`<h3 class="mt-8 mb-3 text-base sm:text-lg font-bold tracking-tight text-[#b23a2e] dark:text-[#e08a63]">${renderInline(h)}</h3>`));
	output = output.replace(/^## (.*?)$/gm, (_m, h) => savePlaceholder(`<h2 class="mt-10 mb-4 border-b border-black/10 dark:border-white/10 pb-2 text-lg sm:text-xl font-bold tracking-tight">${renderInline(h)}</h2>`));

	// 6. BLOCKQUOTES
	output = output.replace(/^> (.*?)$/gm, (_m, q) => savePlaceholder(`<blockquote class="my-3 border-l-2 border-[#b23a2e] pl-3 italic opacity-85 text-xs sm:text-sm">${renderInline(q)}</blockquote>`));

	// 7. LISTS (Ordered and Unordered, with sub-item nesting)
	output = output.replace(/(?:^|\n)((?:(?:[ \t]*(?:[-*]|\d+\.)) [^\n]+\n*)+)/g, (_match, listBlock) => {
		const rawLines = listBlock.trim().split('\n').filter((l: string) => l.trim().length > 0);
		if (rawLines.length === 0) return '';

		const isOrdered = /^\s*\d+\.\s+/.test(rawLines[0]);
		let listHtml = '';
		let inSublist = false;

		for (const line of rawLines) {
			const isSubitem = /^[ \t]{2,}(?:[-*]|\d+\.)\s+/.test(line);

			if (isSubitem) {
				if (!inSublist) {
					listHtml += '<ul class="my-1.5 list-disc space-y-1 pl-5 opacity-90">';
					inSublist = true;
				}
				const cleaned = line.replace(/^[ \t]+(?:[-*]|\d+\.)\s+/, '');
				listHtml += `<li class="leading-relaxed text-xs sm:text-sm">${renderInline(cleaned)}</li>`;
			} else {
				if (inSublist) {
					listHtml += '</ul>';
					inSublist = false;
				}
				const cleaned = line.replace(/^(?:[-*]|\d+\.)\s+/, '');
				listHtml += `<li class="my-1 leading-relaxed text-xs sm:text-sm opacity-90">${renderInline(cleaned)}</li>`;
			}
		}

		if (inSublist) {
			listHtml += '</ul>';
		}

		const tag = isOrdered ? 'ol' : 'ul';
		const cls = isOrdered
			? 'my-3 list-decimal space-y-1.5 pl-6 text-xs sm:text-sm'
			: 'my-3 list-disc space-y-1.5 pl-5 text-xs sm:text-sm';

		return savePlaceholder(`<${tag} class="${cls}">${listHtml}</${tag}>`);
	});

	// 8. PARAGRAPHS
	const paragraphs = output
		.split(/\n\n+/)
		.map((p) => {
			const trimmed = p.trim();
			if (!trimmed) return '';
			if (/^__DOCS_PLACEHOLDER_\d+__$/.test(trimmed)) {
				return trimmed;
			}
			return `<p class="my-2.5 text-xs sm:text-sm leading-relaxed opacity-85">${renderInline(trimmed)}</p>`;
		})
		.join('\n');

	// 9. RESTORE PLACEHOLDERS
	let finalHtml = paragraphs;
	for (let i = 0; i < placeholders.length; i++) {
		finalHtml = finalHtml.replace(`__DOCS_PLACEHOLDER_${i}__`, placeholders[i]);
	}

	return finalHtml;
}

function renderInline(text: string): string {
	return text
		// INLINE CODE
		.replace(/`([^`]+)`/g, '<code class="rounded bg-black/5 dark:bg-white/10 px-1.5 py-0.5 text-[11px] font-mono text-[#b23a2e] dark:text-[#e08a63]">$1</code>')
		// BOLD
		.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-bold opacity-100">$1</strong>')
		// ITALIC
		.replace(/\*([^*]+)\*/g, '<em class="italic">$1</em>')
		// LINKS
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="font-semibold text-[#b23a2e] hover:underline dark:text-[#e08a63] transition-colors" target="_blank" rel="noreferrer">$1</a>');
}
