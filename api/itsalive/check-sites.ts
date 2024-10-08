import type {VercelRequest, VercelResponse} from "@vercel/node";
import {createClient} from "@supabase/supabase-js";
import {Database} from "./_supabase.types";

const supabase = createClient<Database>(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_KEY
);

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CALLBACK_URL = `https://api.telegram.org/bot${BOT_TOKEN}`;

export default async function handler(req: VercelRequest, res: VercelResponse) {
	if (req.method !== "POST") {
		return res.status(405).send("Method Not Allowed");
	}

	const {data: sites, error} = await supabase.from("itsalive_sites").select();

	if (error) {
		console.error({
			message: "something went wrong while fetching sites",
			error,
		});

		return res.status(500).json({
			message: "something went wrong while computing",
			error,
		});
	}

	const sendMessageUrl = `${CALLBACK_URL}/sendMessage`;

	for (const site of sites) {
		const response = await fetch(site.website, {
			method: "HEAD",
		});

		await supabase
			.from("itsalive_sites")
			.update({
				last_check: new Date().toISOString(),
				last_status: response.ok ? "online" : "down",
			})
			.eq("tg_user_id", site.tg_user_id);

		if (!response.ok) {
			await fetch(sendMessageUrl, {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify({
					chat_id: site.tg_user_id,
					text: `${site.website} it's down 🚨`,
				}),
			});
		} else if (response.ok && site.last_status === "down") {
			await fetch(sendMessageUrl, {
				method: "POST",
				headers: {"Content-Type": "application/json"},
				body: JSON.stringify({
					chat_id: site.tg_user_id,
					text: `${site.website} it's back online ✅`,
				}),
			});
		}
	}

	return res.status(200).json({
		message: "message handled",
	});
}
