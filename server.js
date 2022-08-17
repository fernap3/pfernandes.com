const dotenv = require("dotenv");
dotenv.config();

const path = require("path");
const fs = require("fs").promises;
const translations = require("./translations.json");
const countryCodes = require("country-code-lookup");
const compression = require("compression");
const handlebars = require("express-handlebars");

const TEST_MODE = process.env.LIVE_MODE == null || process.env.LIVE_MODE == "";

const ALBUMS = require("./albums.json");
const PRODUCTS = [
	{
		title: "Q.E.D.",
		id: "12f33901-a02c-408d-95ca-2457cb176cb1",
		productId: TEST_MODE ? "prod_MEAHxXduaaES5e" : "prod_MEBsv27zZcp8Wm",
		priceId: TEST_MODE ? "price_1LVhxEE4w3gmRKqxxeJUDt7S" : "price_1LVjUaE4w3gmRKqxCv2eeycM",
		pageUrl: "/qed",
		downloads: [
			{
				s3Key: "track-downloads/qed/full-album/Peter Fernandes - Q.E.D. (mp3_256).zip",
				linkTitle: "Download as MP3"
			},
			{
				s3Key: "track-downloads/qed/full-album/Peter Fernandes - Q.E.D. (flac).zip",
				linkTitle: "Download as FLAC"
			},
			{
				s3Key: "track-downloads/qed/full-album/Peter Fernandes - Q.E.D. (wav).zip",
				linkTitle: "Download as WAV"
			},
		]
	},
	{
		title: `Q.E.D. 'Minus one' package`,
		id: "07d5fee4-2f61-42de-847d-6dd60a5c6d2b",
		productId: TEST_MODE ? "prod_MEzdF6HCfs3O8l" : "prod_MF0XYEkGfapAk6",
		priceId: TEST_MODE ? "price_1LWVeAE4w3gmRKqxgYItRW61" : "price_1LWWWZE4w3gmRKqxxCroiYG0",
		pageUrl: "/qed",
		downloads: [
			{
				s3Key: "track-downloads/qed/minus-one/qed-minusone-mp3.zip",
				linkTitle: "Download as MP3"
			},
			{
				s3Key: "track-downloads/qed/minus-one/qed-minusone-wav.zip",
				linkTitle: "Download as WAV"
			},
		]
	},
];

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

const hb = handlebars.create({
	layout: false,
	extname: "hbs",
});

app.engine(".hbs", handlebars.engine({
	layout: false,
	extname: "hbs",
}));
app.set("view engine", "hbs");
app.set("view options", {layout: false});
app.set("views", path.join(__dirname, "static"));
app.use(bodyParser.json());
app.use(compression());
app.enable("trust proxy");

app.get(/\/(jp\/)?unsubscribe/, async (req, res) =>
{
	const email = req.query.email;

	if (email == "" || email == null || !EMAIL_REGEX.test(email))
	{
		res.status(400).send("'email' query parameter must be a valid email address");
		return;
	}

	const client = new SESClient({ region: "us-east-1"});

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
		urlPath = "/index.hbs";

	let urlPathParts = urlPath.split("/");
	let pathOnDisk = path.resolve(".", "static", ...urlPathParts);

	const topLevelPages = new Set(["incline", "qed", "resume", "unsubscribe", "works"]);

	if (topLevelPages.has(urlPathParts.at(-1)))
	{
		urlPath = urlPath + ".hbs";
		urlPathParts[urlPathParts.length - 1] = urlPathParts[urlPathParts.length - 1] + ".hbs";
		pathOnDisk = pathOnDisk + ".hbs";
	}

	if (urlPath.endsWith(".hbs"))
	{
		if (pageLang === "jp")
			res.set("Content-Language", "ja");
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

	if (urlPath.endsWith(".hbs"))
	{
		const fileName = pathOnDisk.split("/").at(-1);

		let page_path_without_lang_prefix = req.path.replace("/jp", "");
		if (!page_path_without_lang_prefix.startsWith("/"))
			page_path_without_lang_prefix = "/" + page_path_without_lang_prefix;

		const origin = (req.headers["x-forwarded-proto"] ?? (TEST_MODE ? "http" : "https")) + "://" + req.get("host");
		const webPageOrigin = origin.replace("api.", "");

		const pageTranslations = { ...translations };
		for (const key in pageTranslations)
			pageTranslations[key] = pageTranslations[key][pageLang === "jp" ? 1 : 0];

		
		const filenameWithoutExtension = path.parse(fileName).name;
		res.render(filenameWithoutExtension, {
			layout: false,
			page_lang: pageLang === "jp" ? "ja" : "en",
			site_root: pageLang === "jp" ? "/jp" : "/",
			lang_prefix: pageLang === "jp" ? "/jp/" : "/",
			page_path: req.path,
			page_path_without_lang_prefix,
			full_page_url: `${webPageOrigin}${req.url == "/" ? "" : req.url}`,
			full_page_url_en: `${webPageOrigin}${page_path_without_lang_prefix == "/" ? "" : page_path_without_lang_prefix}`,
			full_page_url_jp: `${webPageOrigin}/jp${page_path_without_lang_prefix == "/" ? "" : page_path_without_lang_prefix}`,
			origin: webPageOrigin,
			api_root: origin,
			css: {
				fonts: await fs.readFile(path.join(__dirname, "static", "fonts.css"), { encoding: "utf8" }),
				main: await fs.readFile(path.join(__dirname, "static", "main.css"), { encoding: "utf8" }),
			},
			lang: pageTranslations,
			album: ALBUMS.find(a => a.page === fileName),
			helpers: {
				lang: (langId) => {
					return pageTranslations[langId];
				},
				evalAsTemplate: (templateText, context) => {
					return hb.handlebars.compile(templateText)(context);
				}
			}
		});
		return;
	}

	res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

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
			handleSale(checkoutSession).catch(e => console.error(e));
			break;
		// ... handle other event types
		// default:
			// console.log(`Unhandled event type ${event.type}`);
	}

	// Return a 200 response to acknowledge receipt of the event
	res.status(200).json({received: true});
});

app.post("/create-checkout-session", async (req, res) =>
{
	let successType = null;
	let priceId = null;
	let successUrl = null;
	let cancelUrl = null;

	const productId = req.query.productId;

	const product = PRODUCTS.find(p => p.id === productId);

	if (product == null)
	{
		res.status(400).send(`Bad product ID, ${productId}`)
		return;
	}

	successType = "download";
	priceId = product.priceId;
	successUrl = `${req.get("origin")}${product.pageUrl}?purchaseSuccess=${successType}`;
	cancelUrl = `${req.get("origin")}${product.pageUrl}`;

	const session = await stripe.checkout.sessions.create({
		line_items: [{ price: priceId, quantity: 1 }],
		mode: "payment",
		success_url: successUrl,
		cancel_url: cancelUrl,
		// shipping_address_collection: {
		// 	allowed_countries: ["AC", "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AT", "AU", "AW", "AX", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK", "CL", "CM", "CN", "CO", "CR", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IO", "IQ", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MK", "ML", "MM", "MN", "MO", "MQ", "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PN", "PR", "PS", "PT", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV", "SX", "SZ", "TA", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW", "ZZ"]
		// },
		// shipping_options: {
		// 	shipping_rate: "ID_HERE"
		// }
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

	const client = new SESClient({ region: "us-east-1"});

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
	const productId = lineItem.price.product;

	console.log("FULL SESSION:", session);

	const customerEmail = session.customer_details.email;

	const product = PRODUCTS.find(p => p.productId === productId);

	if (product == null)
		throw `Bad product ID when handling completed checkout session: ${productId}`;

	try
	{
		await sendDownloadsEmail(customerEmail, product);
		await sendPeterEmail(session.customer_details, session.shipping, product, lineItem.description);
	}
	catch(e)
	{
		console.log(e);
	}

	//const customer = await stripe.customers.retrieve(session.customer);
	
	// const downloadUrl = await getS3DownloadUrl();
}

async function sendDownloadsEmail(toAddress, product)
{
	const downloads = [];

	for (const download of product.downloads)
	{
		downloads.push({
			linkTitle: download.linkTitle,
			signedUrl: await getS3DownloadUrl(download.s3Key),
		});
	}
	
	const client = new SESClient({ region: "us-east-1"});

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
							Thank you for purchasing ${product.title}!  Links to download are below. 
							The links will work for 24 hours from the time this email was sent.  
							If you have any issues, just reply to this email and I’ll help you out.
						</p>
						<p>Peter</p>
						${downloads.map(d => `<p><a href="${d.signedUrl}">${d.linkTitle}</a></p>`).join("")}
					`,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: `Your "${product.title}" downloads`,
			}
		}
	};

	await client.send(new SendEmailCommand(params));
}

async function sendPeterEmail(customer, shipping, product, productDesc)
{
	const client = new SESClient({ region: "us-east-1"});

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
							${customer.name} (${customer.email ?? "no email address"}) has purchased ${productDesc} (${product.id}).
						</p>
						<p>Customer's address:</p>
						<p>${shippingAddressFormatted ?? "No address provided"}</p>
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
		Key: `${key}`,
	});
	
	return await getSignedUrl(client, command, { expiresIn: 86400 });
}

const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));
