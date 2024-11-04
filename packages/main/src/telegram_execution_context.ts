import TelegramApi from './telegram_api.js';
import TelegramBot from './telegram_bot.js';
import TelegramInlineQueryResultArticle from './types/TelegramInlineQueryResultArticle.js';
import TelegramInlineQueryResultPhoto from './types/TelegramInlineQueryResultPhoto.js';
import TelegramUpdate from './types/TelegramUpdate.js';
import TelegramInlineQueryResultVideo from './types/TelegramInlineQueryResultVideo.js';

/** Class representing the context of execution */
export default class TelegramExecutionContext {
	/** an instance of the telegram bot */
	bot: TelegramBot;
	/** an instance of the telegram update */
	update: TelegramUpdate;
	/** string representing the type of update that was sent */
	update_type = '';
	/** reference to TelegramApi class */
	api = new TelegramApi();

	/**
	 * Create a telegram execution context
	 * @param bot - the telegram bot
	 * @param update - the telegram update
	 */
	constructor(bot: TelegramBot, update: TelegramUpdate) {
		this.bot = bot;
		this.update = update;

		if (this.update.message?.photo) {
			this.update_type = 'photo';
		} else if (this.update.message?.text) {
			this.update_type = 'message';
		} else if (this.update.inline_query?.query) {
			this.update_type = 'inline';
		} else if (this.update.message?.document) {
			this.update_type = 'document';
		} else if (this.update.callback_query?.id) {
			this.update_type = 'callback';
		}
	}

	/**
	 * Reply to the last message with a video
	 * @param video - string to a video on the internet or a file_id on telegram
	 * @param options - any additional options to pass to sendVideo
	 */
	async replyVideo(video: string, options: Record<string, number | string | boolean> = {}) {
		switch (this.update_type) {
			case 'message':
				return await this.api.sendVideo(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					video,
				});
			case 'inline':
				return await this.api.answerInline(this.bot.api.toString(), {
					...options,
					inline_query_id: this.update.inline_query?.id.toString() ?? '',
					results: [new TelegramInlineQueryResultVideo(video)],
				});

			default:
				break;
		}
	}

	/**
	 * Get File from telegram file_id
	 * @param file_id - telegram file_id
	 */
	async getFile(file_id: string) {
		return await this.api.getFile(this.bot.api.toString(), { file_id }, this.bot.token);
	}

	/**
	 * Reply to the last message with a photo
	 * @param photo - url or file_id to photo
	 * @param caption - photo caption
	 * @param options - any additional options to pass to sendPhoto
	 */
	async replyPhoto(photo: string, caption = '', options: Record<string, number | string | boolean> = {}) {
		switch (this.update_type) {
			case 'photo':
				return await this.api.sendPhoto(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					photo,
					caption,
				});
			case 'message':
				return await this.api.sendPhoto(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					photo,
					caption,
				});
			case 'inline':
				return await this.api.answerInline(this.bot.api.toString(), {
					inline_query_id: this.update.inline_query?.id.toString() ?? '',
					results: [new TelegramInlineQueryResultPhoto(photo)],
				});

			default:
				break;
		}
	}

	/**
	 * Reply to the last message with text
	 * @param message - text to reply with
	 * @param parse_mode - one of HTML, MarkdownV2, Markdown, or an empty string for ascii
	 * @param options - any additional options to pass to sendMessage
	 */
	async reply(message: string, parse_mode = '', options: Record<string, number | string | boolean> = {}) {
		switch (this.update_type) {
			case 'message':
				return await this.api.sendMessage(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					text: message,
					parse_mode,
				});
			case 'photo':
				return await this.api.sendMessage(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					text: message,
					parse_mode,
				});
			case 'inline':
				return await this.api.answerInline(this.bot.api.toString(), {
					inline_query_id: this.update.inline_query?.id.toString() ?? '',
					results: [new TelegramInlineQueryResultArticle(message)],
				});
			case 'document':
				return await this.api.sendMessage(this.bot.api.toString(), {
					...options,
					chat_id: this.update.message?.chat.id.toString() ?? '',
					reply_to_message_id: this.update.message?.message_id.toString() ?? '',
					text: message,
					parse_mode,
				});
			default:
				break;
		}
	}
}
