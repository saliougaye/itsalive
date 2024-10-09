import type {VercelRequest, VercelResponse} from "@vercel/node";
import {z} from "zod";
import {supabase} from "./_client";
import {computeSiteStatusEmoji, sendMessage} from "./_utils";
import dayjs from "dayjs";
import relativeTime from "dayjs/plugin/relativeTime";

dayjs.extend(relativeTime);

const validator = z.object({
	message: z.object({
		text: z.string(),
		from: z.object({
			id: z.number(),
		}),
	}),
});

const ADD_COMMAND = "/add";
const LIST_COMMAND = "/list";
const HELP_COMMAND = "/help";
const START_COMMAND = "/start";

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") {
		return res.status(405).send("Method Not Allowed");
	}

	const {error, data} = await validator.safeParseAsync(req.body);

	if (error) {
		console.error({
			message: "Input not valid",
			errors: error.errors,
		});

		return res.status(400).send("Invalid request");
	}

	if (data.message.text === ADD_COMMAND) {
		await handleAddCommand(data.message.from.id);
		return res.status(200).json({
			message: "waiting url",
		});
	}

	const {data: user_state} = await supabase
		.from("itsalive_user_states")
		.select()
		.eq("tg_user_id", data.message.from.id)
		.maybeSingle();

	if (user_state.state === "waiting_url") {
		await handleUrlAdding(data.message.text, data.message.from.id);
		return res.status(200).send("message handled");
	}

	if (data.message.text === LIST_COMMAND) {
		await handleListSites(data.message.from.id);
		return res.status(200).json({
			message: "message handled",
		});
	}

	if (
		data.message.text === HELP_COMMAND ||
		data.message.text === START_COMMAND
	) {
		await sendMessage(
			data.message.from.id,
			"Welcome to It's alive, a bot to check if a site it's online"
		);
		return res.status(200).json({
			message: "Message sent",
		});
	}

	await sendMessage(
		data.message.from.id,
		"Unknown command, use /help to have more information"
	);

	res.status(200).json({
		message: "Message sent",
	});
}

const handleAddCommand = async (tg_user_id: number) => {
	await Promise.all([
		supabase
			.from("itsalive_user_states")
			.upsert({tg_user_id, state: "waiting_url"})
			.select(),
		sendMessage(
			tg_user_id,
			"Please, add the URL of the website you want to check"
		),
	]);
};

const handleUrlAdding = async (message: string, tg_user_id: number) => {
	const {data: url, error} = await z.string().url().safeParseAsync(message);

	if (error) {
		await sendMessage(tg_user_id, "URL not valid, retry with /add command");
	} else {
		await Promise.all([
			supabase.from("itsalive_sites").insert({
				tg_user_id,
				website: url,
				last_status: "not_checked",
			}),
			sendMessage(tg_user_id, `I will check for you if ${url} it's alive 🤓`),
		]);
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
		await sendMessage(
			tg_user_id,
			"You are not tracking any website, use /add to add the first one"
		);

		return;
	}

	const sitesStatus = sites
		.map(
			(site) => `${site.website} ${computeSiteStatusEmoji(site.last_status)}`
		)
		.join("\n");

	const lastCheckDoneAt = sites[0]?.last_check
		? dayjs().from(dayjs(sites[0]?.last_check), true)
		: null;

	const lastCheck = lastCheckDoneAt
		? `Last check done ${lastCheckDoneAt} ago`
		: "";

	await sendMessage(
		tg_user_id,
		`Your site statuses 👀\n\n${sitesStatus}\n\n${lastCheck}`
	);
};
