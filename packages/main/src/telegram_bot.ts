import TelegramUpdate from './types/TelegramUpdate.js';
import TelegramExecutionContext from './telegram_execution_context.js';
import Webhook from './webhook.js';

/** Class representing a telegram bot. */
export default class TelegramBot {
	/** The telegram token */
	token: string;
	/** The telegram api URL */
	api: URL;
	/** The telegram webhook object */
	webhook: Webhook = new Webhook('', new Request('http://127.0.0.1'));
	/** The telegram update object */
	update: TelegramUpdate = new TelegramUpdate({});
	/** The telegram commands record map */
	commands: Record<string, (ctx: TelegramExecutionContext) => Promise<Response>> = {};
	/** The current bot context */
	currentContext!: TelegramExecutionContext;

	/**
	 *	Create a bot
	 *	@param token - the telegram secret token
	 */
	constructor(token: string) {
		this.token = token;
		this.api = new URL('https://api.telegram.org/bot' + token);
	}

	/**
	 * Register a function on the bot
	 * @param event - the event or command name
	 * @param callback - the bot context
	 */
	on(event: string, callback: (ctx: TelegramExecutionContext) => Promise<Response>) {
		if (!['on', 'handle'].includes(event)) {
			this.commands[event] = callback;
		}
		return this;
	}

	/**
	 * Handle a request on a given bot
	 * @param request - the request to handle
	 */
	async handle(request: Request): Promise<Response> {
		this.webhook = new Webhook(this.token, request);
		const url = new URL(request.url);
		if (`/${this.token}` === url.pathname) {
			switch (request.method) {
				case 'POST': {
					this.update = await request.json();
					console.log(this.update);
					let command = ':message';
					let args: string[] = [];
					const ctx = new TelegramExecutionContext(this, this.update);
					this.currentContext = ctx;
					switch (ctx.update_type) {
						case 'message': {
							args = this.update.message?.text?.split(' ') ?? [];
							break;
						}
						case 'inline': {
							args = this.update.inline_query?.query.split(' ') ?? [];
							break;
						}
						case 'photo': {
							command = ':photo';
							break;
						}
						case 'document': {
							command = ':document';
							break;
						}
						case 'callback': {
							command = ':callback';
							break;
						}
						default:
							break;
					}
					if (args.at(0)?.startsWith('/')) {
						command = args.at(0)?.slice(1) ?? ':message';
					}
					if (!(command in this.commands)) {
						command = ':message';
					}
					return await this.commands[command](ctx);
				}
				case 'GET': {
					switch (url.searchParams.get('command')) {
						case 'set':
							return this.webhook.set();

						default:
							break;
					}
					break;
				}

				default:
					break;
			}
		}
		return new Response('ok');
	}
}
