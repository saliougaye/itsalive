const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CALLBACK_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;
const sendMessageUrl = `${CALLBACK_URL}/sendMessage`;
export const sendMessage = async (chat_id: number, text: string) => {
	return fetch(sendMessageUrl, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			chat_id,
			text,
		}),
	});
};

export const computeSiteStatusEmoji = (status: string) => {
	switch (status) {
		case "down":
			return "🚨";
		case "online":
			return "✅";
		default:
			return "⏳";
	}
};
