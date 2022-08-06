const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const fs = require("fs").promises;
const translations = require("./translations.json");
const countryCodes = require("country-code-lookup");

const STRIPE_KEY = process.env.STRIPE_KEY;

if (!STRIPE_KEY)
{
	console.log("Must specify STRIPE_KEY variable in .env")
	process.exit(1);
}

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require("stripe")(STRIPE_KEY);

const express = require("express");
const app = express();
const bodyParser = require("body-parser");

const EMAIL_REGEX = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

app.use(bodyParser.json());

app.get(/\/(jp\/)?unsubscribe/, async (req, res) =>
{
	const email = req.query.email;

	if (email == "" || email == null || !EMAIL_REGEX.test(email))
	{
		res.status(400).send("'email' query parameter must be a valid email address");
		return;
	}

	const client = new SESClient({ region: "us-west-1"});

	const params = {
		Source: `"Peter Fernandes" <noreply@pfernandes.com>`,
		Destination: { ToAddresses: ["supersonicandtails@gmail.com"] },
		Message: {
			Body: {
				Text: {
					Charset: "UTF-8",
					Data: `${email} has requested to be unsubscribed from the Peter Fernandes mailing list. Please remove the user from the list.`,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: `${email} has requested to be unsubscribed from the Peter Fernandes mailing list`,
			}
		}
	};

	await client.send(new SendEmailCommand(params));

	await handleResourceGet(req, res);
});

app.get("/*", async (req, res) =>
{
	await handleResourceGet(req, res);
});

async function handleResourceGet(req, res)
{
	const pageLang = req.path.startsWith("/jp") ? "jp" : "en";
	let urlPath = req.path.replace("/jp", "");
	if (urlPath === "")
		urlPath = "/";

	if (urlPath === "/")
		urlPath = "/index.html";

	let urlPathParts = urlPath.split("/");
	let pathOnDisk = path.resolve(".", "static", ...urlPathParts);

	const topLevelPages = new Set(["incline", "resume", "unsubscribe"]);

	if (topLevelPages.has(urlPathParts.at(-1)))
	{
		urlPath = urlPath + ".html";
		urlPathParts[urlPathParts.length - 1] = urlPathParts[urlPathParts.length - 1] + ".html";
		pathOnDisk = pathOnDisk + ".html";
	}

	if (urlPath.endsWith(".html"))
	{
		if (pageLang === "jp")
			res.set("Content-Language", "jp");
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
		const fileName = pathOnDisk.split("/").at(-1);
		let html = await replaceTemplates(pathOnDisk, pageLang)
		html = await translateHtml(html, fileName, pageLang);
		html = await replaceVariables(html, req, pageLang);
		
		res.status(200).send(html);
		return;
	}

	res.status(200).sendFile(pathOnDisk);
}

app.post("/webhook", (req, res) =>
{
	const event = req.body;

	// console.log(event)

	// Handle the event
	switch (event.type)
	{
		case "checkout.session.completed":
			const checkoutSession = event.data.object;
			handleSale(checkoutSession);
			break;
		// ... handle other event types
		default:
			console.log(`Unhandled event type ${event.type}`);
	}

	// Return a 200 response to acknowledge receipt of the event
	res.status(200).json({received: true});
});

app.post("/create-checkout-session", async (req, res) =>
{
	let successType = null;

	const productId = req.query.productId;

	switch (productId)
	{
		case "signed-cd":
			successType = "physical";
			break;
		case "sealed-cd":
			successType = "physical";
			break;
		case "album-download":
			successType = "download";
			break;
		case "minus-one":
			successType = "download";
			break;
		case "sheet-music":
			successType = "download";
			break;
		default:
			res.status(400).send(`Bad product ID, ${productId}`)
			return;
	}

	let successUrl = `${req.get("origin")}/incline?purchaseSuccess=${successType}`;

	const session = await stripe.checkout.sessions.create({
		line_items: [
			{
				// Provide the exact Price ID (for example, pr_1234) of the product you want to sell
				price: "price_1L1D7lE4w3gmRKqxan8Azghf",
				quantity: 1,
			},
		],
		mode: "payment",
		success_url: successUrl,
		cancel_url: `${req.get("origin")}/incline`,
		shipping_address_collection: {
			allowed_countries: ["AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW", "ZZ"]
		},
		shipping_options: {
			shipping_rate: "ID_HERE"
		}
		
	});

	res.redirect(303, session.url);
});

app.post("/mailing-list/subscribe", async (req, res) =>
{
	const { name, email } = req.body;

	if (name == "" || name == null)
	{
		res.status(400).send("'name' property must present");
		return;
	}

	if (email == "" || email == null || !EMAIL_REGEX.test(email))
	{
		res.status(400).send("'email' property must be a valid email address");
		return;
	}

	const client = new SESClient({ region: "us-west-1"});

	const params = {
		Source: `"Peter Fernandes" <noreply@pfernandes.com>`,
		Destination: { ToAddresses: ["supersonicandtails@gmail.com"] },
		Message: {
			Body: {
				Text: {
					Charset: "UTF-8",
					Data: `${name} (${email}) has subscribed to the Peter Fernandes mailing list.`,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: `${name} has subscribed to the Peter Fernandes mailing list!`,
			}
		}
	};

	await client.send(new SendEmailCommand(params));

	res.status(200).send();
});


async function handleSale(checkoutSession)
{
	const session = await stripe.checkout.sessions.retrieve(checkoutSession.id, { expand: ["line_items"] });
	const lineItem = session.line_items.data[0];
	const productId = lineItem.id;

	console.log("FULL SESSION:", session)

	const customerEmail = session.customer_details.email;

	try
	{
		await sendDownloadsEmail(customerEmail);
		await sendPeterEmail(session.customer_details, session.shipping, productId, lineItem.description);
	}
	catch(e)
	{
		console.log(e);
	}

	//const customer = await stripe.customers.retrieve(session.customer);
	
	// const downloadUrl = await getS3DownloadUrl();
}

async function sendDownloadsEmail(toAddress)
{
	const mp3DownloadUrl = await getS3DownloadUrl("incline-mp3");
	const flacDownloadUrl = await getS3DownloadUrl("incline-flac");
	const wavDownloadUrl = await getS3DownloadUrl("incline-wav");
	
	const client = new SESClient({ region: "us-west-1"});

	const params = {
		Source: `"Peter Fernandes" <noreply@pfernandes.com>`,
		Destination: { ToAddresses: [toAddress] },
		ReplyToAddresses: ["supersonicandtails@gmail.com"],
		Message: {
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `
						<p>
							Thank you for purchasing “Incline!”  Links to download the album are below. 
							The links will work for 24 hours from the time this email was sent.  
							If you have any issues, just reply to this email and I’ll help you out.
						</p>
						<p>Peter</p>
						<p><a href="${mp3DownloadUrl}">Download as MP3</a></p>
						<p><a href="${flacDownloadUrl}">Download as FLAC</a></p>
						<p><a href="${wavDownloadUrl}">Download as WAV</a></p>
						`,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: `Your "Incline" downloads`,
			}
		}
	};

	await client.send(new SendEmailCommand(params));
}

async function sendPeterEmail(customer, shipping, productId, productDesc)
{
	const client = new SESClient({ region: "us-west-1"});

	let shippingAddressFormatted = null;

	if (shipping)
	{
		shippingAddressFormatted = `
			${shipping.name}<br>
			${shipping.address.line1}<br>
			${shipping.address.line2}<br>
			${shipping.address.city} ${shipping.address.state} ${shipping.address.postal_code}<br>
			${countryCodes.byIso(shipping.address.country)}
		`;
	}

	const params = {
		Source: `"Peter Fernandes" <noreply@pfernandes.com>`,
		Destination: { ToAddresses: ["supersonicandtails@gmail.com"] },
		Message: {
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: `
						<p>
							${customer.name} (${customer.email ?? "no email address"}) has purchased ${productDesc}.
						</p>
						<p>Customer's address:</p>
						<p>${customer.address ?? "No address provided"}</p>
						`,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: `Someone purchased ${productDesc}!`,
			}
		}
	};

	await client.send(new SendEmailCommand(params));
}


async function getS3DownloadUrl(key)
{
	const client = new S3Client({region: "us-east-1"});
	const command = new GetObjectCommand({
		Bucket: "pfernandes.com",
		Key: `incline-downloads/${key}`,
	});
	
	return await getSignedUrl(client, command, { expiresIn: 86400 });
}

async function replaceVariables(html, req, page_lang)
{
	let page_path_without_lang_prefix = req.path.replace("/jp", "");
	if (!page_path_without_lang_prefix.startsWith("/"))
		page_path_without_lang_prefix = "/" + page_path_without_lang_prefix;

	const origin = (req.secure ? "https://" : "https://") + req.get("host").replace("api.", "");
	
	const vars = {
		page_lang,
		page_path_without_lang_prefix,
		full_page_url: `${origin}${req.url == "/" ? "" : req.url}`,
		full_page_url_en: `${origin}${page_path_without_lang_prefix == "/" ? "" : page_path_without_lang_prefix}`,
		full_page_url_jp: `${origin}/jp${page_path_without_lang_prefix == "/" ? "" : page_path_without_lang_prefix}`,
	};
	
	return html.replace(/\{\{(.+?)\}\}/g, (matchValue, propName) => {
		return vars[propName] ?? matchValue;
	});
}

async function replaceTemplates(fullPath, pageLang)
{
	const fileText = await fs.readFile(fullPath, { encoding: "utf8" });

	const templateRegex = /\{\{template=(.+)\}\}/g;
	const templateHtmls = {};
	let match;

	while ((match = templateRegex.exec(fileText)) != null)
	{
		const templateFilename = match[1];
		const templateFullPath = path.resolve(".", "static", templateFilename);
		const templateText = await fs.readFile(templateFullPath, { encoding: "utf8" });
		templateHtmls[templateFilename] = templateText;
	}

	for (const templateFilename of Object.keys(templateHtmls))
	{
		templateHtmls[templateFilename] = await translateHtml(templateHtmls[templateFilename], templateFilename, pageLang);
	}
	
	return fileText.replace(templateRegex, (matchValue, templateName) =>
	{
		return templateHtmls[templateName];
	});
}

async function translateHtml(html, fileName, lang)
{
	const translationIndex = lang === "jp" ? 1 : 0;
	const langObj = translations[fileName];

	if (langObj == null)
		return html;

	return html.replace(/\{\{(.+?)\}\}/g, (matchValue, langKey) => {
		const keyParts = langKey.split(".").slice(1); // Get rid of the "lang." prefix from the key

		if (langObj[keyParts[0]] == null)
			return matchValue;

		return langObj[keyParts[0]][translationIndex] ?? matchValue;
	});
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
