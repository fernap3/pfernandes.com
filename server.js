const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const fs = require("fs").promises;
const translations = require("./translations.json");

const STRIPE_KEY = process.env.STRIPE_KEY;

if (!STRIPE_KEY)
{
	console.log("Must specify STRIPE_KEY variable in .env")
	process.exit(1);
}

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require("stripe")(STRIPE_KEY);

const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const { response } = require("express");

app.use(bodyParser.json());

app.get("/*", async (req, res) =>
{
	const pageLang = req.path.startsWith("/jp") ? "jp" : "en";
	let urlPath = req.path.replace("/jp", "");
	if (urlPath === "")
		urlPath = "/";

	if (urlPath === "/")
		urlPath = "/index.html";

	let urlPathParts = urlPath.split("/");
	let pathOnDisk = path.resolve(".", "static", ...urlPathParts);

	const topLevelPages = new Set(["incline", "resume"]);

	if (topLevelPages.has(urlPathParts.at(-1)))
	{
		urlPath = urlPath + ".html";
		urlPathParts[urlPathParts.length - 1] = urlPathParts[urlPathParts.length - 1] + ".html";
		pathOnDisk = pathOnDisk + ".html";
	}
	
	try
	{
		await fs.stat(pathOnDisk);
	}
	catch(e)
	{
		res.status(404).send("Resource not found");
		return;
	}

	if (urlPath.endsWith(".html"))
	{
		res.status(200).send(await translateHtml(pathOnDisk, pageLang));
		return;
	}

	res.status(200).sendFile(pathOnDisk);
});

async function translateHtml(fullPath, lang)
{
	const fileText = await fs.readFile(fullPath, { encoding: "utf8" });
	const translationIndex = lang === "jp" ? 1 : 0;
	const fileName = fullPath.split("/").at(-1);
	const langObj = translations[fileName];

	if (langObj == null)
		return fileText;

	return fileText.replace(/\{\{(.+?)\}\}/g, (matchValue, langKey) => {
		const keyParts = langKey.split(".").slice(1); // Get rid of the "lang." prefix from the key

		if (langObj[keyParts[0]] == null)
			return matchValue;

		return langObj[keyParts[0]][translationIndex] ?? matchValue;
	});
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));