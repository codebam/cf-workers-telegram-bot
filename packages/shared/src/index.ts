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

/**
 * Get the balance for a user, initializing it if it doesn't exist
 * @param userId - the telegram user ID | string
 * @param kv - the KV namespace
 * @returns the user's balance
 */
export async function getBalance(userId: number | string, kv: KVNamespace): Promise<number> {
	const balanceKey = `balance:${String(userId)}`;
	const balance = await kv.get<number>(balanceKey, 'json');
	if (balance === null) {
		const defaultBalance = 100;
		await kv.put(balanceKey, JSON.stringify(defaultBalance));
		return defaultBalance;
	}
	return balance;
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
		'You are a friendly assistant named TuxRobot. You have access to an HTTP fetch tool, a web search tool, and document tools. You also have a secure sandbox workspace with Bun installed, allowing you to run arbitrary JavaScript or TypeScript code! If a user asks you to write, modify, or run JavaScript/TypeScript code, you can use the `code_workspace` tool to execute `bun run <file.ts>` or run scripts directly in the sandbox. If a user asks you to get data from an API, look up a profile, or visit a website, you MUST execute the fetch tool yourself to get the data. You can perform web searches using the `tavily_search` tool. If the user asks about an uploaded document, a file, a PDF, or a markdown file, you MUST use the `search_telegram_file` tool to search its contents; do NOT use `tavily_search` or write code. If a user asks a follow-up question about a document they previously uploaded, use the tool again if needed. When calling tools, use the EXACT name provided (e.g., `search_telegram_file`); do NOT add any prefixes like "functions.". If the user replies with only a single word, sticker, or emoji, respond with no more than one short paragraph. Always keep replies below 4096 characters. Only use formatting that will be supported on Telegram. DO NOT use LaTeX formatting or math equations (like \\( ... \\) or \\[ ... \\]); always use standard plain text or simple markdown formatting as LaTeX does not render on Telegram.',
	BUSINESS_MODE:
		'You are {owner_name}. You are replying to a message from a customer, friend, or contact on Telegram. Be helpful, natural, and concise. Do not mention you are an AI or a bot. Your name is {owner_name}. Respond exactly as {owner_name}. Do not use any generic placeholders like [Business Name], [Your Name], or similar in your response. Only use tools if you truly need outside information to answer the question. Only use formatting that will be supported on Telegram. DO NOT use LaTeX formatting or math equations (like \\( ... \\) or \\[ ... \\]); always use standard plain text or simple markdown formatting as LaTeX does not render on Telegram.'
};

export const DEFAULT_MODEL = 'glm-4.7-flash';

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

export interface Environment {
	SECRET_TELEGRAM_API_TOKEN: string;
	SECRET_TELEGRAM_WEBHOOK?: string;
	GITHUB_TOKEN?: string;
	AI: Ai;
	R2: R2Bucket;
	CONVERSATION_HISTORY: KVNamespace;
	AI_WORKFLOW: Fetcher;
	STREAM_WORKFLOW: any;
	TAVILY_API_KEY?: string;
	Sandbox: DurableObjectNamespace<Sandbox>;
	VECTORIZE?: VectorizeIndex;
	ENVIRONMENT?: string;
	COMMIT_SHA?: string;
	FLAGS?: Flagship;
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
	userId?: number | string;
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

export async function verifyTelegramWebAppData(
	initData: string,
	botToken: string
): Promise<boolean> {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	params.delete('hash');

	const sortedParams = Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

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

	const signature = await crypto.subtle.sign('HMAC', signatureKey, encoder.encode(sortedParams));

	const signatureHex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return signatureHex === hash;
}

export async function verifyTelegramLogin(initData: string, botToken: string): Promise<boolean> {
	const params = new URLSearchParams(initData);
	const hash = params.get('hash');
	params.delete('hash');

	const sortedParams = Array.from(params.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([key, value]) => `${key}=${value}`)
		.join('\n');

	const encoder = new TextEncoder();
	const tokenHash = await crypto.subtle.digest('SHA-256', encoder.encode(botToken));

	const signatureKey = await crypto.subtle.importKey(
		'raw',
		tokenHash,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);

	const signature = await crypto.subtle.sign('HMAC', signatureKey, encoder.encode(sortedParams));

	const signatureHex = Array.from(new Uint8Array(signature))
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('');

	return signatureHex === hash;
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

