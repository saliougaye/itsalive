import type {VercelRequest, VercelResponse} from "@vercel/node";
import {createClient} from "@supabase/supabase-js";
import {Database} from "./_supabase.types";
import {z} from "zod";

const supabase = createClient<Database>(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CALLBACK_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

const validator = z.object({
	message: z.object({
		text: z.string(),
		from: z.object({
			id: z.number(),
		}),
	}),
});
const sendMessageUrl = `${CALLBACK_URL}/sendMessage`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
	console.log(req.body);

	if (req.method !== "POST") {
		return res.status(405).send("Method Not Allowed");
	}

	const validationResult = await validator.safeParseAsync(req.body);

	if (validationResult.error) {
		console.error({
			message: "Input not valid",
			errors: validationResult.error.errors,
		});

		return res.status(400).send("Invalid request");
	}

	if (validationResult.data.message.text === "/add") {
		await handleAddCommand(validationResult.data.message.from.id);
		return res.status(200).json({
			message: "waiting url",
		});
	}

	const {data: user_state} = await supabase
		.from("itsalive_user_states")
		.select()
		.eq("tg_user_id", validationResult.data.message.from.id)
		.maybeSingle();

	if (!user_state) {
		return res.status(200).send("message not handled");
	}

	if (user_state.state === "waiting_url") {
		await handleUrlAdding(
			validationResult.data.message.text,
			validationResult.data.message.from.id
		);
		return res.status(200).send("message handled");
	}

	if (validationResult.data.message.text === "/list") {
		await handleListSites(validationResult.data.message.from.id);
		return res.status(200).json({
			message: "message handled",
		});
	}

	await fetch(sendMessageUrl, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			chat_id: validationResult.data.message.from.id,
			text: "Welcome to It's alive, a bot to check if a site it's online",
		}),
	});

	res.status(200).json({
		message: "Message sent",
	});
}

const handleAddCommand = async (tg_user_id: number) => {
	const upsertUserState = await supabase
		.from("itsalive_user_states")
		.upsert({tg_user_id, state: "waiting_url"})
		.select();

	await fetch(sendMessageUrl, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			chat_id: tg_user_id,
			text: `Please, add the URL of the website you want to check`,
		}),
	});
};

const handleUrlAdding = async (message: string, tg_user_id: number) => {
	const {data: url, error} = await z.string().url().safeParseAsync(message);

	if (error) {
		await fetch(sendMessageUrl, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				chat_id: tg_user_id,
				text: `URL not valid, retry with /add command`,
			}),
		});
	} else {
		await supabase.from("itsalive_sites").insert({
			tg_user_id,
			website: url,
			last_status: "not_checked",
		});

		await fetch(sendMessageUrl, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				chat_id: tg_user_id,
				text: `I will check for you if ${url} it's alive 🤓`,
			}),
		});
	}

	await supabase
		.from("itsalive_user_states")
		.update({state: "init"})
		.eq("tg_user_id", tg_user_id);
};

const handleListSites = async (tg_user_id: number) => {
	const {data: sites} = await supabase
		.from("itsalive_sites")
		.select()
		.eq("tg_user_id", tg_user_id);

	if (!sites || sites.length === 0) {
		await fetch(sendMessageUrl, {
			method: "POST",
			headers: {"Content-Type": "application/json"},
			body: JSON.stringify({
				chat_id: tg_user_id,
				text: "You are not tracking any website, use /add to add the first one",
			}),
		});

		return;
	}

	const sitesStatus = sites
		.map(
			(site) => `${site.website} ${computeSiteStatusEmoji(site.last_status)}\n`
		)
		.join("\n");

	await fetch(sendMessageUrl, {
		method: "POST",
		headers: {"Content-Type": "application/json"},
		body: JSON.stringify({
			chat_id: tg_user_id,
			text: `Your site statuses\n${sitesStatus}\n\n\nLast check done ${
				sites[0]?.last_check ?? ""
			}`,
		}),
	});
};

const computeSiteStatusEmoji = (status: string) => {
	switch (status) {
		case "down":
			return "🚨";
		case "online":
			return "✅";
		default:
			return "⏳";
	}
};
