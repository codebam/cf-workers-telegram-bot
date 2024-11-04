import TelegramInlineQuery from './TelegramInlineQuery.js';
import TelegramMessage from './TelegramMessage.js';
import PartialTelegramUpdate from './PartialTelegramUpdate.js';
import TelegramCallbackQuery from './TelegramCallbackQuery.js';

export default class TelegramUpdate {
	update_id: number;
	message?: TelegramMessage;
	edited_message?: TelegramMessage;
	channel_post?: TelegramMessage;
	edited_channel_post?: TelegramMessage;
	inline_query?: TelegramInlineQuery;
	// chosen_inline_result?: TelegramChosenInlineResult;
	callback_query?: TelegramCallbackQuery;
	// shipping_query?: TelegramShippingQuery;
	// pre_checkout_query?: TelegramPreCheckoutQuery;
	// poll?: TelegramPoll;
	// poll_answer?: TelegramPollAnswer;
	// my_chat_member?: TelegramChatMemberUpdated;
	// chat_member?: TelegramChatMemberUpdated;
	// chat_join_request: TelegramChatJoinRequest;
	constructor(update: PartialTelegramUpdate) {
		this.update_id = update.update_id ?? 0;
		this.message = update.message;
		this.edited_message = update.edited_message;
		this.channel_post = update.channel_post;
		this.edited_channel_post = update.edited_channel_post;
		this.inline_query = update.inline_query;
		// chosen_inline_result = update.chosen_inline_result;
		// callback_query = update.callback_query;
		// shipping_query = update.shipping_query;
		// pre_checkout_query = update.pre_checkout_query;
		// poll = update.poll;
		// poll_answer = update.poll_answer;
		// my_chat_member = update.my_chat_member;
		// chat_member = update.chat_member;
		// chat_join_request = update.chat_join_request;
	}
}
