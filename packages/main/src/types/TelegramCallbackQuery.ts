import TelegramFrom from './TelegramFrom.js';
import TelegramMessage from './TelegramMessage.js';

interface TelegramCallbackQuery {
    chat_type: 'sender' | 'private' | 'group' | 'supergroup' | 'channel';
    from: TelegramFrom;
    id: number;
    offset: string;
    query: string;
    message: TelegramMessage,
    inline_message_id: string;
    chat_instance: string;
    data: string;
    game_short_name: string;
}
export default TelegramCallbackQuery;
