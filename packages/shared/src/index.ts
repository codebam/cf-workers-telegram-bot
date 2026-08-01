import { marked } from 'marked';
import type { Sandbox } from '@cloudflare/sandbox';

/** Class representing a manager for conversation history stored in KV */
export class HistoryManager {
	constructor(private kv: KVNamespace) {}

	private getKey(userId: number | string, threadId?: number): string {
		return threadId ? `history:${String(userId)}:${String(threadId)}` : `history:${String(userId)}`;
	}

	/**
	 * Get the conversation history for a user
	 * @param userId - the telegram user ID
	 * @param threadId - optional thread ID
	 * @returns array of messages
	 */
	async getHistory(
		userId: number | string,
		threadId?: number
	): Promise<{ role: string; content: string }[]> {
		if (!this.kv) {
			return [];
		}
		const history = await this.kv.get<{ role: string; content: string }[]>(
			this.getKey(userId, threadId),
			'json'
		);
		return history ?? [];
	}

	/**
	 * Add a message and its response to the history
	 * @param userId - the telegram user ID
	 * @param prompt - the user message
	 * @param response - the bot response
	 * @param threadId - optional thread ID
	 */
	async addMessage(userId: number | string, prompt: string, response: string, threadId?: number) {
		if (!this.kv) {
			return;
		}
		const history = await this.getHistory(userId, threadId);
		history.push({ role: 'user', content: prompt });
		history.push({ role: 'assistant', content: response });
		const trimmedHistory = history.slice(-20);
		await this.kv.put(this.getKey(userId, threadId), JSON.stringify(trimmedHistory), {
			expirationTtl: 86400
		});
	}

	/**
	 * Clear the conversation history for a user
	 * @param userId - the telegram user ID
	 * @param threadId - optional thread ID
	 */
	async clearHistory(userId: number | string, threadId?: number) {
		if (!this.kv) {
			return;
		}
		await this.kv.delete(this.getKey(userId, threadId));
	}
}

/** Credits granted to a user the first time we see them. */
export const DEFAULT_NEW_USER_BALANCE = 200;

/**
 * Read the balance mirror for a user.
 *
 * This is a *read-only* view. The authoritative balance lives in the
 * `UserAccount` durable object, which mirrors every mutation back into KV so
 * that display paths (dashboard, SSE, /balance) stay cheap. Never write the
 * result of this function back to KV — that read-modify-write is exactly the
 * race the durable object exists to avoid.
 *
 * @param userId - the telegram user ID | string
 * @param kv - the KV namespace
 * @returns the user's balance
 */
export async function getBalance(userId: number | string, kv: KVNamespace): Promise<number> {
	const balanceKey = `balance:${String(userId)}`;
	const balance = await kv.get<number>(balanceKey, 'json');
	return balance ?? DEFAULT_NEW_USER_BALANCE;
}

export async function markdownToHtml(s: string): Promise<string> {
	const renderer = new marked.Renderer();

	// Telegram supports: b, strong, i, em, u, ins, s, strike, del, span, tg-spoiler, a, code, pre, blockquote

	renderer.heading = ({ tokens, depth }) => {
		const text = renderer.parser.parseInline(tokens);
		if (depth === 1) {
			return `<b>${text}</b>\n\n`;
		}
		if (depth === 2) {
			return `<b>${text}</b>\n\n`;
		}
		return `<b>${text}</b>\n\n`;
	};

	renderer.paragraph = ({ tokens }) => {
		const text = renderer.parser.parseInline(tokens);
		return `${text}\n\n`;
	};

	renderer.br = () => '\n';

	renderer.list = ({ items, ordered, start }) => {
		let result = '';
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const prefix = ordered
				? `${start !== '' && start !== undefined ? Number(start) + i : i + 1}\\. `
				: '• ';
			result += `${prefix}${renderer.listitem(item)}\n`;
		}
		return result;
	};

	renderer.listitem = (item) => {
		return renderer.parser.parse(item.tokens).trim();
	};

	renderer.strong = ({ tokens }) => `<b>${renderer.parser.parseInline(tokens)}</b>`;
	renderer.em = ({ tokens }) => `<i>${renderer.parser.parseInline(tokens)}</i>`;
	const escapeHtml = (text: string) =>
		text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	renderer.codespan = ({ text }) => `<code>${escapeHtml(text)}</code>`;
	renderer.code = ({ text, lang }) => {
		const escapedText = escapeHtml(text);
		if (lang) {
			return `<pre><code class="language-${lang}">${escapedText}</code></pre>\n`;
		}
		return `<pre><code>${escapedText}</code></pre>\n`;
	};
	renderer.del = ({ tokens }) => `<s>${renderer.parser.parseInline(tokens)}</s>`;

	renderer.link = ({ href, tokens }) =>
		`<a href="${escapeHtml(href)}">${renderer.parser.parseInline(tokens)}</a>`;
	renderer.image = ({ href, text }) => `<a href="${escapeHtml(href)}">${escapeHtml(text)}</a>`;

	renderer.blockquote = ({ tokens }) => {
		return `<blockquote>${renderer.parser.parse(tokens)}</blockquote>\n`;
	};

	renderer.hr = () => `────────\n\n`;

	// html tag pass-through for supported tags or escaping
	renderer.html = ({ text }) => {
		const allowedTags = [
			'b',
			'strong',
			'i',
			'em',
			'u',
			'ins',
			's',
			'strike',
			'del',
			'span',
			'tg-spoiler',
			'a',
			'code',
			'pre',
			'blockquote'
		];
		const match = /^<\/?([a-z0-9-]+)(?:\s+[^>]*)?>/i.exec(text);
		if (match) {
			const tagName = match[1].toLowerCase();
			if (allowedTags.includes(tagName)) {
				return text; // Allow through
			}
		}
		// Escape everything else
		return escapeHtml(text);
	};

	renderer.text = (token) => {
		if ('tokens' in token && token.tokens) {
			return renderer.parser.parseInline(token.tokens);
		}
		// Escape standard HTML entities
		return escapeHtml(token.text);
	};

	marked.setOptions({
		gfm: true,
		breaks: true
	});

	const parsed = await marked.parse(s, { renderer });

	// Trim multiple newlines
	return (parsed as string).replace(/\n{3,}/g, '\n\n').trim();
}

export function sanitizeMarkdownV2(text: string, isInsideLink = false): string {
	// Standard MarkdownV2 characters that MUST be escaped outside of code/pre
	// First, we unescape any existing escapes to avoid double-escaping
	let unescaped = text.replace(/\\([_*[\]()~`>#+\-=|{}.!\\])/g, '$1');

	// Telegram's MarkdownV2 is extremely strict: ANY of these characters MUST be escaped
	// if they are not part of a valid entity. To be safe, we escape them all.
	let escaped = unescaped.replace(/([_*[\]()~`>#+\-=|{}.!\\])/g, '\\$1');

	if (isInsideLink) {
		// Inside links, additional characters need escaping to avoid breaking the link syntax
		escaped = escaped.replace(/([()])/g, '\\$1');
	}
	return escaped;
}

export function formatTableAsAscii(header: string[], rows: string[][]): string {
	const colCount = Math.max(header.length, ...rows.map((r) => r.length));
	if (colCount === 0) return '';

	const colWidths = new Array(colCount).fill(0);
	for (let c = 0; c < colCount; c++) {
		colWidths[c] = Math.max(
			(header[c] || '').length,
			...rows.map((r) => (r[c] || '').length)
		);
	}

	const pad = (text: string, width: number) => text + ' '.repeat(Math.max(0, width - text.length));

	const topBorder = '┌' + colWidths.map((w) => '─'.repeat(w + 2)).join('┬') + '┐';
	const headerRow = '│ ' + Array.from({ length: colCount }, (_, i) => pad(header[i] || '', colWidths[i])).join(' │ ') + ' │';
	const midBorder = '├' + colWidths.map((w) => '─'.repeat(w + 2)).join('┼') + '┤';
	const dataRows = rows.map(
		(r) => '│ ' + Array.from({ length: colCount }, (_, i) => pad(r[i] || '', colWidths[i])).join(' │ ') + ' │'
	);
	const botBorder = '└' + colWidths.map((w) => '─'.repeat(w + 2)).join('┴') + '┘';

	return [topBorder, headerRow, midBorder, ...dataRows, botBorder].join('\n');
}

export function convertMarkdownTablesToAscii(text: string): string {
	const parts = text.split(/(```[\s\S]*?```)/g);
	return parts
		.map((part, index) => {
			if (index % 2 === 1) return part;

			const tableRegex = /((?:^[ \t]*\|[^\n]+\|[ \t]*\r?\n){2,}(?:[ \t]*\|[^\n]+\|[ \t]*\r?\n?)*)/gm;
			return part.replace(tableRegex, (match) => {
				const lines = match.trim().split(/\r?\n/).filter((line) => line.trim().startsWith('|'));
				if (lines.length < 2) return match;

				const isSeparator = /^\|(?:\s*:?-+:?\s*\|)+$/.test(lines[1].trim());
				if (!isSeparator) return match;

				const parseRow = (row: string) => row.split('|').slice(1, -1).map((c) => c.trim());

				const header = parseRow(lines[0]);
				const dataRows = lines.slice(2).map(parseRow);

				const asciiTable = formatTableAsAscii(header, dataRows);
				return `\n\`\`\`text\n${asciiTable}\n\`\`\`\n\n`;
			});
		})
		.join('');
}

export interface RichBlock {
	type: string;
	[key: string]: any;
}

export function markdownToRichBlocks(markdownText: string): RichBlock[] {
	const tokens = marked.lexer(markdownText);
	const blocks: RichBlock[] = [];

	for (const token of tokens) {
		if (token.type === 'heading') {
			blocks.push({
				type: 'heading',
				text: token.text,
				size: Math.min(6, Math.max(1, token.depth)),
			});
		} else if (token.type === 'paragraph') {
			blocks.push({
				type: 'paragraph',
				text: token.text,
			});
		} else if (token.type === 'space') {
			continue;
		} else if (token.type === 'hr') {
			blocks.push({ type: 'divider' });
		} else if (token.type === 'code') {
			blocks.push({
				type: 'pre',
				text: token.text,
				language: token.lang || undefined,
			});
		} else if (token.type === 'blockquote') {
			blocks.push({
				type: 'blockquote',
				blocks: [{ type: 'paragraph', text: token.text }],
			});
		} else if (token.type === 'list') {
			const items = (token.items || []).map((item: any) => ({
				label: item.text,
				blocks: [{ type: 'paragraph', text: item.text }],
			}));
			blocks.push({
				type: 'list',
				items,
			});
		} else if (token.type === 'table') {
			const headerCells = (token.header || []).map((h: any) => ({
				text: h.text,
				is_header: true,
				align: h.align || 'left',
				valign: 'top',
			}));
			const rows = (token.rows || []).map((row: any) =>
				row.map((cell: any) => ({
					text: cell.text,
					align: cell.align || 'left',
					valign: 'top',
				}))
			);
			blocks.push({
				type: 'table',
				cells: [headerCells, ...rows],
				is_bordered: true,
				is_striped: true,
			});
		} else {
			if ('raw' in token && token.raw.trim()) {
				blocks.push({
					type: 'paragraph',
					text: token.raw.trim(),
				});
			}
		}
	}

	if (blocks.length === 0 && markdownText.trim()) {
		blocks.push({
			type: 'paragraph',
			text: markdownText.trim(),
		});
	}

	return blocks;
}

export async function markdownToMarkdownV2(s: string): Promise<string> {
	const renderer = new marked.Renderer();

	const escape = (text: string, isLink = false) => sanitizeMarkdownV2(text, isLink);

	renderer.heading = ({ tokens }) => {
		const text = renderer.parser.parseInline(tokens);
		return `*${text}*\n\n`;
	};

	renderer.paragraph = ({ tokens }) => {
		const text = renderer.parser.parseInline(tokens);
		return `${text}\n\n`;
	};

	renderer.br = () => '\n';

	renderer.list = ({ items, ordered, start }) => {
		let result = '';
		for (let i = 0; i < items.length; i++) {
			const item = items[i];
			const prefix = ordered
				? `${start !== '' && start !== undefined ? Number(start) + i : i + 1}\\. `
				: '• ';
			result += `${prefix}${renderer.listitem(item)}\n`;
		}
		return result;
	};

	renderer.listitem = (item) => {
		return renderer.parser.parse(item.tokens).trim();
	};

	renderer.table = ({ header, rows }) => {
		const headerCells = header.map((c) => renderer.parser.parseInline(c.tokens).trim());
		const bodyRows = rows.map((r) => r.map((c) => renderer.parser.parseInline(c.tokens).trim()));
		const colCount = Math.max(headerCells.length, ...bodyRows.map((r) => r.length));
		if (colCount === 0) return '';
		const headerLine = '| ' + Array.from({ length: colCount }, (_, i) => headerCells[i] || '').join(' | ') + ' |';
		const sepLine = '| ' + new Array(colCount).fill('---').join(' | ') + ' |';
		const dataLines = bodyRows.map((r) => '| ' + Array.from({ length: colCount }, (_, i) => r[i] || '').join(' | ') + ' |');
		return [headerLine, sepLine, ...dataLines].join('\n') + '\n\n';
	};

	renderer.strong = ({ tokens }) => `*${renderer.parser.parseInline(tokens)}*`;
	renderer.em = ({ tokens }) => `_${renderer.parser.parseInline(tokens)}_`;
	renderer.codespan = ({ text }) => `\`${text.replace(/[`\\]/g, '\\$&')}\``;
	renderer.code = ({ text, lang }) => {
		const escapedText = text.replace(/[`\\]/g, '\\$&');
		if (lang) {
			return `\`\`\`${lang}\n${escapedText}\n\`\`\`\n`;
		}
		return `\`\`\`\n${escapedText}\n\`\`\`\n`;
	};
	renderer.del = ({ tokens }) => `~${renderer.parser.parseInline(tokens)}~`;

	renderer.link = ({ href, tokens }) =>
		`[${renderer.parser.parseInline(tokens)}](${escape(href, true)})`;
	renderer.image = ({ href, text }) => `[${escape(text)}](${escape(href, true)})`;

	renderer.blockquote = ({ tokens }) => {
		const text = renderer.parser.parse(tokens).trim();
		return text
			.split('\n')
			.map((line) => `> ${line}`)
			.join('\n');
	};

	renderer.hr = () => `────────\n\n`;

	renderer.text = (token) => {
		if ('tokens' in token && token.tokens) {
			return renderer.parser.parseInline(token.tokens);
		}
		return escape(token.text);
	};

	marked.setOptions({
		gfm: true,
		breaks: true
	});

	const parsed = await marked.parse(s, { renderer });

	// Trim multiple newlines
	return (parsed as string).replace(/\n{3,}/g, '\n\n').trim();
}

/**
 * Compute a SHA-256 hash of a string
 */
export async function sha256(message: string): Promise<string> {
	const msgBuffer = new TextEncoder().encode(message);
	const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
	const hashArray = Array.from(new Uint8Array(hashBuffer));
	return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const SYSTEM_PROMPTS = {
	TUX_ROBOT:
		'You are a friendly assistant named TuxRobot. You have access to an HTTP fetch tool, a web search tool, and document tools. You also have a secure sandbox workspace with Bun installed, allowing you to run arbitrary JavaScript or TypeScript code! If a user asks you to write, modify, or run JavaScript/TypeScript code, you can use the `code_workspace` tool to execute `bun run <file.ts>` or run scripts directly in the sandbox. If a user asks you to get data from an API, look up a profile, or visit a website, you MUST execute the fetch tool yourself to get the data. You can perform web searches using the `tavily_search` tool. If the user asks about an uploaded document, a file, a PDF, or a markdown file, you MUST use the `search_telegram_file` tool to search its contents; do NOT use `tavily_search` or write code. If a user asks a follow-up question about a document they previously uploaded, use the tool again if needed. When calling tools, use the EXACT name provided (e.g., `search_telegram_file`); do NOT add any prefixes like "functions.". If the user replies with only a single word, sticker, or emoji, respond with no more than one short paragraph.',
	BUSINESS_MODE:
		'You are {owner_name}. You are replying to a message from a customer, friend, or contact on Telegram. Be helpful, natural, and concise. Do not mention you are an AI or a bot. Your name is {owner_name}. Respond exactly as {owner_name}. Do not use any generic placeholders like [Business Name], [Your Name], or similar in your response. Only use tools if you truly need outside information to answer the question.'
};

export const DEFAULT_MODEL = 'glm-4.7-flash';

/** Extra Stars charged on top of the model cost for Whisper transcription. */
export const VOICE_SURCHARGE_STARS = 20;

/** Stars charged per web app file upload. */
export const UPLOAD_COST_STARS = 5;

/** Cost of one `/photo` image generation. */
export const PHOTO_COST_STARS = 100;

/** Hard cap on history entries accepted from an untrusted request body. */
export const MAX_HISTORY_MESSAGES = 40;

export const AVAILABLE_MODELS: Record<
	string,
	{ id: string; cost: number; supportsTools?: boolean; supportsVision?: boolean }
> = {
	gemma4: { id: '@cf/google/gemma-4-26b-a4b-it', cost: 8, supportsTools: true, supportsVision: true },
	'google/gemini-3-flash': { id: 'google/gemini-3-flash', cost: 25, supportsTools: true, supportsVision: true },
	'google/gemini-3.1-flash-lite': {
		id: 'google/gemini-3.1-flash-lite',
		cost: 12,
		supportsTools: true,
		supportsVision: true
	},
	'google/gemini-3.1-pro': { id: 'google/gemini-3.1-pro', cost: 150, supportsTools: true, supportsVision: true },
	'llama-3.2-vision': {
		id: '@cf/meta/llama-3.2-11b-vision-instruct',
		cost: 8,
		supportsTools: true,
		supportsVision: true
	},
	'kimi-k2.6': { id: '@cf/moonshotai/kimi-k2.6', cost: 45, supportsTools: true, supportsVision: true },
	'glm-4.7-flash': { id: '@cf/zai-org/glm-4.7-flash', cost: 5, supportsTools: true, supportsVision: true },
	'deepseek-r1-32b': {
		id: '@cf/deepseek-ai/deepseek-r1-distill-qwen-32b',
		cost: 80,
		supportsTools: false
	},
	'nemotron-3': { id: '@cf/nvidia/nemotron-3-120b-a12b', cost: 20, supportsTools: true }
};

/** Look up a model entry by its provider-facing id (e.g. `@cf/...`). */
export function modelConfigById(id: string | undefined) {
	if (!id) return undefined;
	return Object.values(AVAILABLE_MODELS).find((cfg) => cfg.id === id);
}

/** Human-readable, always-current list of vision-capable models and prices. */
export function visionModelList(): string {
	return Object.entries(AVAILABLE_MODELS)
		.filter(([, cfg]) => cfg.supportsVision)
		.map(([name, cfg]) => `- \`/model ${name}\` (${String(cfg.cost)} Stars)`)
		.join('\n');
}

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	SECRET_TELEGRAM_WEBHOOK?: string;
	/** Guards the `GET /?command=set` webhook registration endpoint. */
	SECRET_ADMIN_TOKEN?: string;
	GITHUB_TOKEN?: string;
	AI: Ai;
	R2: R2Bucket;
	CONVERSATION_HISTORY: KVNamespace;
	AI_WORKFLOW: Fetcher;
	STREAM_WORKFLOW: any;
	TAVILY_API_KEY?: string;
	Sandbox: DurableObjectNamespace<Sandbox>;
	/** Authoritative, serialized per-user balance ledger. */
	USER_ACCOUNT: DurableObjectNamespace;
	VECTORIZE?: VectorizeIndex;
	ENVIRONMENT?: string;
	COMMIT_SHA?: string;
	FLAGS?: Flagship;
}

/** Result of an atomic balance mutation on the `UserAccount` durable object. */
export interface AccountResult {
	ok: boolean;
	balance: number;
	/** Present when `ok` is false because the user could not afford the charge. */
	shortfall?: number;
}

export interface Tool {
	name: string;
	description: string;
	parameters: Record<string, unknown>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	function: (args: any) => Promise<unknown>;
}

export interface NormalizedToolCall {
	id: string;
	type: 'function';
	function: { name: string; arguments: string };
}

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant' | 'tool' | string;
	content?: string;
	tool_calls?: NormalizedToolCall[];
	tool_call_id?: string;
	name?: string;
	geminiParts?: GeminiPart[];
}

export interface Task {
	type: 'message' | 'business_message' | 'photo' | 'gen_photo' | 'voice' | 'tool_call';
	updateId?: number;
	updateType?: string;
	guestQueryId?: string;
	businessConnectionId?: string;
	prompt: string;
	/** Owner of the conversation history (may be a `business:...` composite). */
	userId?: number | string;
	/** Numeric Telegram id whose balance is debited. Always set by the server. */
	billingUserId?: number;
	senderId?: number;
	chatId?: string;
	threadId?: number;
	messageId?: number;
	history?: { role: string; content: string }[];
	modelId?: string;
	fileId?: string;
	systemPrompt?: string;
	telegramToken?: string;
	token?: string;
	tools?: Tool[];
	stream?: boolean;
	geminiParts?: GeminiPart[];
	/**
	 * Stars already debited for this task. Used to refund the user if every
	 * workflow attempt fails.
	 */
	chargedAmount?: number;
}

export interface RawToolCall {
	id?: string;
	type?: string;
	name?: string;
	arguments?: string | Record<string, unknown>;
	function?: { name?: string; arguments?: string | Record<string, unknown> };
}

export interface GeminiPart {
	text?: string;
	thought?: boolean;
	inlineData?: { mimeType: string; data: string };
	functionCall?: { name: string; args: Record<string, unknown> };
	functionResponse?: { name: string; response: { content: string } };
}

export interface AiResponse {
	choices?: {
		delta?: { content?: string; reasoning_content?: string; thought?: string };
		message?: { content?: string; tool_calls?: RawToolCall[]; reasoning_content?: string; thought?: string };
		tool_calls?: RawToolCall[];
	}[];
	response?: string;
	text?: string;
	content?: string;
	delta?: string | { content?: string; reasoning_content?: string; thought?: string };
	parts?: GeminiPart[];
	candidates?: {
		content?: { parts?: GeminiPart[] };
	}[];
	message?: Record<string, unknown>;
	tool_calls?: RawToolCall[];
}

type ExtractInput = string | AiResponse | Record<string, unknown> | null | undefined;

export const THINK_TAGS = ['think', 'thinking', 'reasoning', 'reflection', 'thought', 'analysis'];
export const THINK_BLOCK_RE = new RegExp(
	`<(?:${THINK_TAGS.join('|')})(?:\\s[^>]*)?>[\\s\\S]*?</(?:${THINK_TAGS.join('|')})>`,
	'gi'
);
export const THINK_OPEN_ONLY_RE = new RegExp(`<(?:${THINK_TAGS.join('|')})(?:\\s[^>]*)?>[\\s\\S]*$`, 'i');

/**
 * Strip <think>/<reasoning>/etc. blocks from a complete string. Also drops
 * an unterminated opening block (when the model never closes it) and trims
 * leading whitespace left behind.
 */
export function stripThinking(text: string): string {
	if (!text) return text;
	let out = text.replace(THINK_BLOCK_RE, '');
	out = out.replace(THINK_OPEN_ONLY_RE, '');
	return out.replace(/^\s+/, '');
}

/**
 * Robustly extract text from various AI response formats.
 */
export function extractText(obj: ExtractInput, includeReasoning = false): string {
	if (typeof obj === 'string') return obj;
	if (!obj || typeof obj !== 'object') return '';

	const response = obj as any;

	// Prioritize direct fields
	if (response.response && typeof response.response === 'string') return response.response;
	if (response.text && typeof response.text === 'string') return response.text;
	if (response.content && typeof response.content === 'string') return response.content;
	
	// Handle delta objects (OpenAI-style streaming)
	if (response.delta && typeof response.delta === 'object') {
		if (response.delta.content && typeof response.delta.content === 'string') return response.delta.content;
		if (includeReasoning) {
			if (response.delta.reasoning_content && typeof response.delta.reasoning_content === 'string') return response.delta.reasoning_content;
			if (response.delta.thought && typeof response.delta.thought === 'string') return response.delta.thought;
		}
		if (response.delta.text && typeof response.delta.text === 'string') return response.delta.text;
	}
	if (response.delta && typeof response.delta === 'string') return response.delta;

	// Nested fields
	if (response.choices?.[0]) {
		const choice = response.choices[0];
		if (choice.delta) return extractText(choice.delta, includeReasoning);
		if (choice.message) return extractText(choice.message, includeReasoning);
		if (choice.text && typeof choice.text === 'string') return choice.text;
	}
	
	if (response.candidates?.[0]) return extractText(response.candidates[0].content, includeReasoning);
	
	// Gemini parts
	if (Array.isArray(response.parts)) {
		let text = '';
		for (const part of response.parts) {
			if (!includeReasoning && part.thought) continue;
			if (part.text) text += part.text;
		}
		return text;
	}

	return '';
}

export function extractThinking(obj: ExtractInput): string {
	if (!obj || typeof obj !== 'object') return '';
	const response = obj as any;

	if (response.delta?.thought && typeof response.delta.thought === 'string') return response.delta.thought;

	if (response.choices?.[0]) {
		const choice = response.choices[0];
		if (choice.delta?.thought) return choice.delta.thought;
		if (choice.message?.thought) return choice.message.thought;
		return extractThinking(choice);
	}
	
	if (response.candidates?.[0]?.content?.parts) {
		let thinking = '';
		for (const part of response.candidates[0].content.parts) {
			if (part.thought && part.text) thinking += part.text;
		}
		return thinking;
	}
	
	if (Array.isArray(response.parts)) {
		let thinking = '';
		for (const part of response.parts) {
			if (part.thought && part.text) thinking += part.text;
		}
		return thinking;
	}

	return '';
}

export function extractReasoning(obj: ExtractInput): string {
	if (!obj || typeof obj !== 'object') return '';
	const response = obj as any;

	if (response.delta?.reasoning_content && typeof response.delta.reasoning_content === 'string') return response.delta.reasoning_content;

	if (response.choices?.[0]) {
		const choice = response.choices[0];
		if (choice.delta?.reasoning_content) return choice.delta.reasoning_content;
		if (choice.message?.reasoning_content) return choice.message.reasoning_content;
		return extractReasoning(choice);
	}

	return '';
}

/**
 * How long a Telegram auth proof stays usable. Mini App `initData` is refreshed
 * every time the app is opened; Login Widget data is held in a cookie for the
 * same window, so an intercepted proof stops working after this long instead of
 * being valid forever.
 */
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

/** Compare two hex strings without leaking their contents through timing. */
function timingSafeEqualHex(a: string | null, b: string | null): boolean {
	if (!a || !b || a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i++) {
		diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return diff === 0;
}

function checkAuthDate(params: URLSearchParams, maxAgeSeconds: number): boolean {
	const authDate = Number(params.get('auth_date'));
	if (!Number.isFinite(authDate) || authDate <= 0) return false;
	const ageSeconds = Math.floor(Date.now() / 1000) - authDate;
	// Reject stale proofs, and reject proofs dated more than 5 minutes into the
	// future (clock skew allowance) so a forged auth_date can't extend validity.
	return ageSeconds <= maxAgeSeconds && ageSeconds >= -300;
}

function sortedDataCheckString(params: URLSearchParams): string {
	return Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');
}

function toHex(buffer: ArrayBuffer): string {
	return Array.from(new Uint8Array(buffer))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');
}

export async function verifyTelegramWebAppData(
	initData: string,
	botToken: string,
	maxAgeSeconds = AUTH_MAX_AGE_SECONDS
): Promise<boolean> {
	if (!initData || !botToken) return false;
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	if (!hash) return false;
	params.delete('hash');

	if (!checkAuthDate(params, maxAgeSeconds)) return false;

	const encoder = new TextEncoder();
	const secretKey = await crypto.subtle.importKey(
		'raw',
		encoder.encode('WebAppData'),
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const secret = await crypto.subtle.sign('HMAC', secretKey, encoder.encode(botToken));

	const signatureKey = await crypto.subtle.importKey(
		'raw',
		secret,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		'HMAC',
		signatureKey,
		encoder.encode(sortedDataCheckString(params))
	);

	return timingSafeEqualHex(toHex(signature), hash);
}

export async function verifyTelegramLogin(
	initData: string,
	botToken: string,
	maxAgeSeconds = AUTH_MAX_AGE_SECONDS
): Promise<boolean> {
	if (!initData || !botToken) return false;
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	if (!hash) return false;
	params.delete('hash');

	if (!checkAuthDate(params, maxAgeSeconds)) return false;

	const encoder = new TextEncoder();
	const tokenHash = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));

	const signatureKey = await crypto.subtle.importKey(
		'raw',
		tokenHash,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign(
		'HMAC',
		signatureKey,
		encoder.encode(sortedDataCheckString(params))
	);

	return timingSafeEqualHex(toHex(signature), hash);
}

/**
 * Extract the Telegram user ID carried inside an auth proof. Does *not*
 * validate the proof — always pair it with {@link verifyTelegramAuth}.
 */
export function userIdFromAuthProof(authProof: string): number | null {
	try {
		const params = new URLSearchParams(authProof);
		const userStr = params.get('user');
		const raw = userStr ? (JSON.parse(userStr) as { id?: unknown }).id : params.get('id');
		const id = Number(raw);
		return Number.isSafeInteger(id) && id > 0 ? id : null;
	} catch {
		return null;
	}
}

/**
 * Verify a Telegram auth proof (Mini App `initData` or Login Widget query
 * string) and return the authenticated user ID.
 *
 * This is the only supported way to establish identity. Callers must use the
 * returned ID and never a client-supplied one.
 */
export async function verifyTelegramAuth(
	authProof: string | null | undefined,
	botToken: string,
	maxAgeSeconds = AUTH_MAX_AGE_SECONDS
): Promise<{ valid: boolean; userId: number | null }> {
	if (!authProof) return { valid: false, userId: null };
	const isInitData = await verifyTelegramWebAppData(authProof, botToken, maxAgeSeconds);
	const isLogin = !isInitData && (await verifyTelegramLogin(authProof, botToken, maxAgeSeconds));
	if (!isInitData && !isLogin) return { valid: false, userId: null };
	const userId = userIdFromAuthProof(authProof);
	return { valid: userId !== null, userId };
}

export interface Transaction {
	timestamp: string;
	amount: number;
	type: 'charge' | 'refund' | 'load';
	model?: string;
	taskType?: string;
	newBalance: number;
	description?: string;
}

export async function logTransaction(
	userId: number | string,
	kv: KVNamespace,
	tx: Omit<Transaction, 'timestamp'>
): Promise<void> {
	if (!kv) return;
	const txKey = `transactions:${String(userId)}`;
	const existing = await kv.get<Transaction[]>(txKey, 'json');
	const history = existing ?? [];
	const newTx: Transaction = {
		...tx,
		timestamp: new Date().toISOString(),
	};
	history.push(newTx);
	const trimmed = history.slice(-50);
	await kv.put(txKey, JSON.stringify(trimmed));
}

