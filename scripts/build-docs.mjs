#!/usr/bin/env node
/**
 * Builds the static documentation site published at
 * https://cf-workers-telegram-bot.codebam.ca.
 *
 * The Cloudflare Pages project `cf-workers-telegram-bot-docs` runs
 * `npm run docs` and serves the `docs/` directory. It had been failing because
 * no such script existed any more: the old TypeDoc output documented a library
 * (`TelegramBot`, `TelegramApi`) that this repository stopped being years ago.
 *
 * Model names and prices are read straight out of `packages/shared` so the
 * published pricing table cannot drift from what the bot actually charges.
 */

import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = resolve(ROOT, 'docs');
const SHARED = resolve(ROOT, 'packages/shared/src/index.ts');

const REPO = 'https://github.com/codebam/cf-workers-telegram-bot';

/** Pull a top-level `export const NAME = <literal>;` out of the shared source. */
function extractLiteral(source, name) {
	const marker = source.indexOf(`export const ${name}`);
	if (marker === -1) return null;
	// Skip the type annotation, which contains braces of its own
	// (`: Record<string, { id: string; ... }> = {`).
	const assign = source.indexOf('=', marker);
	if (assign === -1) return null;
	const start = source.indexOf('{', assign);
	if (start === -1) return null;

	let depth = 0;
	for (let i = start; i < source.length; i++) {
		const char = source[i];
		if (char === '{') depth++;
		else if (char === '}') {
			depth--;
			if (depth === 0) {
				const literal = source.slice(start, i + 1);
				try {
					return new Function(`return (${literal});`)();
				} catch (e) {
					console.warn(`[docs] Could not evaluate ${name}: ${e.message}`);
					return null;
				}
			}
		}
	}
	return null;
}

function extractNumber(source, name) {
	const match = new RegExp(`export const ${name}\\s*=\\s*([0-9*\\s]+);`).exec(source);
	if (!match) return null;
	try {
		return new Function(`return (${match[1]});`)();
	} catch {
		return null;
	}
}

const escapeHtml = (value) =>
	String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const shared = await readFile(SHARED, 'utf8');
const models = extractLiteral(shared, 'AVAILABLE_MODELS') ?? {};
const defaultModel = /export const DEFAULT_MODEL = '([^']+)'/.exec(shared)?.[1] ?? '';
const newUserBalance = extractNumber(shared, 'DEFAULT_NEW_USER_BALANCE') ?? 200;
const voiceSurcharge = extractNumber(shared, 'VOICE_SURCHARGE_STARS') ?? 20;
const uploadCost = extractNumber(shared, 'UPLOAD_COST_STARS') ?? 5;
const photoCost = extractNumber(shared, 'PHOTO_COST_STARS') ?? 100;

const yes = '<span class="yes" title="supported">✓</span>';
const no = '<span class="no" title="not supported">—</span>';

const modelRows = Object.entries(models)
	.sort((a, b) => a[1].cost - b[1].cost)
	.map(
		([name, cfg]) => `        <tr>
          <td><code>${escapeHtml(name)}</code>${name === defaultModel ? ' <span class="badge">default</span>' : ''}</td>
          <td class="num">${cfg.cost}</td>
          <td class="center">${cfg.supportsTools ? yes : no}</td>
          <td class="center">${cfg.supportsVision ? yes : no}</td>
        </tr>`
	)
	.join('\n');

const commands = [
	['/start', 'Welcome message and the command list.'],
	['/balance', 'Show your current Star balance.'],
	['/load &lt;amount&gt;', 'Top up your balance with Telegram Stars (1–1000).'],
	['/photo &lt;prompt&gt;', `Generate an image. Costs ${photoCost} Stars.`],
	['/model [name]', 'Show or switch the AI model. Without an argument, lists every model and its price.'],
	['/prompt ["text"]', 'Show, set, or <code>reset</code> your custom system prompt.'],
	['/facts ["text"]', 'Show, set, or <code>reset</code> the facts the bot uses in business mode.'],
	['/clear', 'Delete your conversation history.'],
	['/commit', 'Link to the currently deployed commit.']
]
	.map(
		([cmd, desc]) => `        <tr><td><code>${cmd}</code></td><td>${desc}</td></tr>`
	)
	.join('\n');

const endpoints = [
	['POST', '/', 'Telegram webhook. Requires the <code>X-Telegram-Bot-Api-Secret-Token</code> header when <code>SECRET_TELEGRAM_WEBHOOK</code> is configured.'],
	['GET', '/?command=set&amp;token=…', 'Register the webhook with Telegram. Requires <code>SECRET_ADMIN_TOKEN</code>.'],
	['POST', '/verify', 'Validate a Telegram auth proof. Returns <code>{ valid, userId }</code>.'],
	['POST', '/api/account', 'Authoritative balance for the authenticated user.'],
	['POST', '/api/account/charge', 'Atomically debit the authenticated user.'],
	['POST', '/workflow', 'Run a generation. Identity, model and price are all derived server-side from the auth proof.']
]
	.map(
		([method, path, desc]) =>
			`        <tr><td><span class="method">${method}</span></td><td><code>${path}</code></td><td>${desc}</td></tr>`
	)
	.join('\n');

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>CF Workers Telegram Bot — Documentation</title>
<meta name="description" content="A serverless Telegram AI bot and Svelte web app running on Cloudflare Workers." />
<style>
  :root {
    color-scheme: light dark;
    --bg: #ffffff;
    --panel: #f6f7f9;
    --border: #e3e6ea;
    --fg: #1b1f24;
    --muted: #5b6470;
    --accent: #f38020;
    --code-bg: #f0f2f5;
    --yes: #1a7f45;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #0f1216;
      --panel: #161b22;
      --border: #262d36;
      --fg: #e6edf3;
      --muted: #9aa5b1;
      --code-bg: #1c232c;
      --yes: #3fb950;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: var(--bg);
    color: var(--fg);
    font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .wrap { max-width: 62rem; margin: 0 auto; padding: 0 1.25rem 5rem; }
  header {
    border-bottom: 1px solid var(--border);
    background: linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, transparent), transparent);
  }
  header .wrap { padding-top: 3.5rem; padding-bottom: 2.5rem; }
  h1 { font-size: clamp(1.9rem, 5vw, 2.75rem); line-height: 1.15; margin: 0 0 .6rem; letter-spacing: -.02em; }
  .tagline { color: var(--muted); font-size: 1.1rem; margin: 0 0 1.5rem; max-width: 46rem; }
  .cta { display: flex; flex-wrap: wrap; gap: .6rem; }
  .btn {
    display: inline-block; padding: .55rem 1.1rem; border-radius: .5rem;
    border: 1px solid var(--border); background: var(--panel);
    color: var(--fg); text-decoration: none; font-weight: 600; font-size: .95rem;
  }
  .btn.primary { background: var(--accent); border-color: var(--accent); color: #1b1f24; }
  .btn:hover { border-color: var(--accent); }
  nav.toc { margin: 2.5rem 0 0; padding: 1rem 1.25rem; background: var(--panel); border: 1px solid var(--border); border-radius: .6rem; }
  nav.toc ul { margin: .4rem 0 0; padding-left: 1.1rem; columns: 2; column-gap: 2rem; }
  @media (max-width: 34rem) { nav.toc ul { columns: 1; } }
  nav.toc a { color: var(--fg); }
  h2 { margin: 3rem 0 .8rem; font-size: 1.45rem; letter-spacing: -.01em; scroll-margin-top: 1rem; }
  h3 { margin: 1.8rem 0 .5rem; font-size: 1.1rem; }
  p, li { color: var(--fg); }
  a { color: var(--accent); }
  code {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, monospace;
    font-size: .875em; background: var(--code-bg); padding: .12em .38em; border-radius: .3em;
  }
  pre {
    background: var(--code-bg); border: 1px solid var(--border); border-radius: .5rem;
    padding: .9rem 1rem; overflow-x: auto;
  }
  pre code { background: none; padding: 0; font-size: .85rem; }
  .table-scroll { overflow-x: auto; border: 1px solid var(--border); border-radius: .5rem; }
  table { border-collapse: collapse; width: 100%; font-size: .93rem; }
  th, td { text-align: left; padding: .6rem .8rem; border-bottom: 1px solid var(--border); vertical-align: top; }
  th { background: var(--panel); font-weight: 600; white-space: nowrap; }
  tr:last-child td { border-bottom: none; }
  td.num, td.center { text-align: center; white-space: nowrap; }
  .yes { color: var(--yes); font-weight: 700; }
  .no { color: var(--muted); }
  .badge {
    display: inline-block; font-size: .7rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: .04em; padding: .1rem .4rem; border-radius: .3rem;
    background: var(--accent); color: #1b1f24; vertical-align: middle;
  }
  .method { font-family: ui-monospace, monospace; font-size: .78rem; font-weight: 700; color: var(--muted); }
  .note {
    border-left: 3px solid var(--accent); background: var(--panel);
    padding: .8rem 1rem; border-radius: 0 .4rem .4rem 0; margin: 1.2rem 0;
  }
  .note p { margin: 0; }
  footer { margin-top: 4rem; padding-top: 1.5rem; border-top: 1px solid var(--border); color: var(--muted); font-size: .9rem; }
</style>
</head>
<body>
<header>
  <div class="wrap">
    <h1>CF Workers Telegram Bot</h1>
    <p class="tagline">
      A serverless Telegram AI assistant and companion Svelte web app, running entirely on
      Cloudflare Workers, Workers AI, Durable Objects and Pages.
    </p>
    <div class="cta">
      <a class="btn primary" href="https://t.me/TuxRobot">Open in Telegram</a>
      <a class="btn" href="${REPO}">Source on GitHub</a>
    </div>
  </div>
</header>

<div class="wrap">
  <nav class="toc">
    <strong>Contents</strong>
    <ul>
      <li><a href="#overview">Overview</a></li>
      <li><a href="#commands">Commands</a></li>
      <li><a href="#models">Models &amp; pricing</a></li>
      <li><a href="#credits">Credits &amp; billing</a></li>
      <li><a href="#tools">Tools</a></li>
      <li><a href="#webapp">Web app</a></li>
      <li><a href="#architecture">Architecture</a></li>
      <li><a href="#api">HTTP API</a></li>
      <li><a href="#selfhost">Self-hosting</a></li>
    </ul>
  </nav>

  <h2 id="overview">Overview</h2>
  <p>
    Send the bot a message and it answers using a model of your choice from Workers AI. It can read
    documents you upload, search the web, look things up on Wikipedia, transcribe voice notes,
    generate images, and run Python or TypeScript in a per-user sandbox container.
  </p>
  <p>
    It also works in <strong>business mode</strong>, replying on your behalf to customers in Telegram
    Business chats, and in group chats when mentioned directly.
  </p>

  <h2 id="commands">Commands</h2>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Command</th><th>Description</th></tr></thead>
      <tbody>
${commands}
      </tbody>
    </table>
  </div>
  <p>Anything that is not a command is treated as a prompt. Reply to a message or a document to include it as context.</p>

  <h2 id="models">Models &amp; pricing</h2>
  <p>Prices are per message, in Telegram Stars. This table is generated from the bot's model registry at build time.</p>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Model</th><th class="num">Stars</th><th class="center">Tools</th><th class="center">Vision</th></tr></thead>
      <tbody>
${modelRows}
      </tbody>
    </table>
  </div>
  <p>Switch models with <code>/model &lt;name&gt;</code>. If your chosen model cannot handle a request — an image
     for a text-only model, for example — the bot automatically falls back to one that can and charges that
     model's price instead.</p>

  <h2 id="credits">Credits &amp; billing</h2>
  <ul>
    <li>New users start with <strong>${newUserBalance} free credits</strong>.</li>
    <li>Top up with <code>/load &lt;amount&gt;</code>, paid in Telegram Stars.</li>
    <li>Voice notes add a <strong>${voiceSurcharge} Star</strong> transcription surcharge on top of the model price.</li>
    <li>Web app file uploads cost <strong>${uploadCost} Stars</strong>.</li>
    <li>Image generation costs <strong>${photoCost} Stars</strong>.</li>
  </ul>
  <div class="note">
    <p>Balances are held in a Durable Object, so concurrent messages are billed serially and a failed
       generation is refunded automatically.</p>
  </div>

  <h2 id="tools">Tools</h2>
  <p>Models that support tool calling can reach for these on their own:</p>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Tool</th><th>What it does</th></tr></thead>
      <tbody>
        <tr><td><code>fetch</code></td><td>Perform an HTTP request and read the response.</td></tr>
        <tr><td><code>wikipedia</code></td><td>Search Wikipedia.</td></tr>
        <tr><td><code>tavily_search</code></td><td>Search the live web (feature-flagged).</td></tr>
        <tr><td><code>code_interpreter</code></td><td>Run Python in your sandbox, with numpy, pandas and matplotlib available.</td></tr>
        <tr><td><code>code_workspace</code></td><td>Write files, run commands, and send results back as a document.</td></tr>
        <tr><td><code>read_telegram_file</code></td><td>Extract text from PDF, DOCX, PPTX, XLSX, CSV, TXT and Markdown uploads.</td></tr>
        <tr><td><code>search_telegram_file</code></td><td>Semantic search over an indexed document using Vectorize.</td></tr>
      </tbody>
    </table>
  </div>
  <p>Sandboxes are isolated per user, and workspace file access is confined to <code>/workspace</code>.</p>

  <h2 id="webapp">Web app</h2>
  <p>
    The Mini App at <a href="https://tux-robot.codebam.ca">tux-robot.codebam.ca</a> adds a chat UI, a live
    balance and transaction history, a sandbox log viewer, a voice recorder, a prompt designer, and an
    arena for comparing prompt and model variations side by side.
  </p>
  <p>Sign in happens through Telegram; every request is authenticated by a signed Telegram auth proof.</p>

  <h2 id="architecture">Architecture</h2>
  <div class="table-scroll">
    <table>
      <thead><tr><th>Piece</th><th>Role</th></tr></thead>
      <tbody>
        <tr><td><code>bot</code></td><td>grammY bot on Workers. Handles webhooks, billing, and tool execution.</td></tr>
        <tr><td><code>webapp</code></td><td>SvelteKit Mini App on Cloudflare Pages.</td></tr>
        <tr><td><code>packages/shared</code></td><td>Types, model registry, Telegram auth verification, Markdown helpers.</td></tr>
        <tr><td>Workflows</td><td>Generation runs as a durable workflow step with retries and automatic refunds.</td></tr>
        <tr><td>Durable Objects</td><td><code>UserAccount</code> for balances, <code>Sandbox</code> for code execution.</td></tr>
        <tr><td>KV / R2 / Vectorize</td><td>Conversation history and caches, uploaded files, document embeddings.</td></tr>
      </tbody>
    </table>
  </div>

  <h2 id="api">HTTP API</h2>
  <div class="table-scroll">
    <table>
      <thead><tr><th></th><th>Path</th><th>Description</th></tr></thead>
      <tbody>
${endpoints}
      </tbody>
    </table>
  </div>
  <p>
    Authenticated endpoints take an <code>x-telegram-auth</code> header containing Mini App
    <code>initData</code> or Login Widget query data. The user id is always taken from the verified
    proof, never from the request body.
  </p>

  <h2 id="selfhost">Self-hosting</h2>
  <pre><code>git clone --recursive ${REPO}.git
cd cf-workers-telegram-bot
npm install
npx wrangler login</code></pre>
  <p>Set the bot's secrets, then deploy:</p>
  <pre><code>cd bot
npx wrangler secret put SECRET_TELEGRAM_API_TOKEN --env production
npx wrangler secret put SECRET_TELEGRAM_WEBHOOK  --env production
npx wrangler secret put SECRET_ADMIN_TOKEN       --env production
npx wrangler secret put TAVILY_API_KEY           --env production

make deploy</code></pre>
  <p>Finally, point Telegram at your worker:</p>
  <pre><code>curl "https://&lt;your-worker-host&gt;/?command=set&amp;token=&lt;SECRET_ADMIN_TOKEN&gt;"</code></pre>
  <div class="note">
    <p>Give the <code>dev</code> and <code>production</code> environments separate KV namespaces and
       Vectorize indexes — otherwise a development deploy writes to live user balances and history.</p>
  </div>

  <footer>
    <p>
      Apache-2.0 licensed · <a href="${REPO}">${REPO.replace('https://', '')}</a>
    </p>
  </footer>
</div>
</body>
</html>
`;

await mkdir(OUT_DIR, { recursive: true });
await writeFile(resolve(OUT_DIR, 'index.html'), html, 'utf8');
// Stop Cloudflare Pages / GitHub Pages from applying Jekyll processing.
await writeFile(resolve(OUT_DIR, '.nojekyll'), '', 'utf8');
await writeFile(
	resolve(OUT_DIR, '_headers'),
	['/*', '  X-Frame-Options: DENY', '  X-Content-Type-Options: nosniff', '  Referrer-Policy: strict-origin-when-cross-origin', ''].join('\n'),
	'utf8'
);

console.log(`[docs] Wrote ${OUT_DIR}/index.html (${Object.keys(models).length} models documented)`);
