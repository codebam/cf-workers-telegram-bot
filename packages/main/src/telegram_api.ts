import TelegramInlineQueryResultArticle from './types/TelegramInlineQueryResultArticle.js';
import TelegramInlineQueryResultPhoto from './types/TelegramInlineQueryResultPhoto.js';
import TelegramInlineQueryResultVideo from './types/TelegramInlineQueryResultVideo.js';

/** Class representing the Telegram API and all it's methods */
export default class TelegramApi {
	/**
	 * Get the API URL for a given bot API and slug
	 * @param botApi - full URL to the telegram API without slug
	 * @param slug - slug to append to the API URL
	 * @param data - data to append to the request
	 */
	getApiUrl(botApi: string, slug: string, data: Record<string, number | string | boolean>) {
		const request = new URL(botApi + (slug.startsWith('/') || botApi.endsWith('/') ? '' : '/') + slug);
		const params = new URLSearchParams();
		for (const i in data) {
			params.append(i, data[i].toString());
		}
		return new Request(`${request.toString()}?${params.toString()}`);
	}

	/**
	 * Get a file with a given file_id
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 * @param token - bot token
	 */
	async getFile(botApi: string, data: Record<string, number | string | boolean>, token: string) {
		const url = this.getApiUrl(botApi, 'getFile', data);
		const response = await fetch(url);
		const json: { result: { file_path: string } } = await response.json();
		let file_path: string;
		try {
			file_path = json.result.file_path;
		} catch (e) {
			console.log(`Error: ${e as string}`);
			return new Response('cant read file_path. is the file too large?');
		}
		return await fetch(`https://api.telegram.org/file/bot${token}/${file_path}`);
	}

	/**
	 * Send a message to a given botApi
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 */
	async sendMessage(
		botApi: string,
		data: {
			reply_to_message_id: number | string;
			chat_id: number | string;
			text: string;
			parse_mode: string;
		},
	) {
		const url = this.getApiUrl(botApi, 'sendMessage', data);
		return await fetch(url);
	}

	/**
	 * Send a video message to a given botApi
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 */
	async sendVideo(
		botApi: string,
		data: {
			reply_to_message_id: number | string;
			chat_id: number | string;
			video: string;
		},
	) {
		const url = this.getApiUrl(botApi, 'sendVideo', data);
		return await fetch(url);
	}

	/**
	 * Send a photo message to a given botApi
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 */
	async sendPhoto(
		botApi: string,
		data: {
			reply_to_message_id: number | string;
			chat_id: number | string;
			photo: string;
			caption: string;
		},
	) {
		const url = this.getApiUrl(botApi, 'sendPhoto', data);
		return await fetch(url);
	}

	/**
	 * Send an inline response to a given botApi
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 */
	async answerInline(
		botApi: string,
		data: {
			inline_query_id: number | string;
			results: TelegramInlineQueryResultArticle[] | TelegramInlineQueryResultPhoto[] | TelegramInlineQueryResultVideo[];
		},
	) {
		const url = this.getApiUrl(botApi, 'answerInlineQuery', {
			inline_query_id: data.inline_query_id,
			results: JSON.stringify(data.results),
		});
		return await fetch(url);
	}


	/**
	 * Send an callback response to a given botApi
	 * @param botApi - full URL to the telegram API without slug
	 * @param data - data to append to the request
	 */
	async answerCallback(
		botApi: string,
		data: {
			callback_query_id: number | string;
			text?: string;
			show_alert?: boolean;
			url?: string;
			cache_time?: number;
		},
	) {
		const url = this.getApiUrl(botApi, 'answerCallbackQuery', data);
		return await fetch(url);
	}
}
