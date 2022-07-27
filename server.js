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

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");
const { SESClient, SendEmailCommand } = require("@aws-sdk/client-ses");

// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require("stripe")(STRIPE_KEY);

const express = require("express");
const app = express();
const bodyParser = require("body-parser");

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

// Match the raw body to content type application/json
app.post("/webhook", (request, response) =>
{
	const event = request.body;

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
  response.status(200).json({received: true});
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

	let successUrl = `${req.get("origin")}/purchase-success.html?type=${successType}`;

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
		cancel_url: `${req.get("origin")}/incline.html`,
		
	});

	res.redirect(303, session.url);
});


async function handleSale(checkoutSession)
{
	const session = await stripe.checkout.sessions.retrieve(checkoutSession.id, { expand: ["line_items"] });
	const lineItem = session.line_items.data[0];
	const productId = lineItem.id;

	console.log("FULL SESSION:", session)

	const customerEmail = session.customer_details.email;

	await sendDownloadsEmail(customerEmail);

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
		Source: "noreply@pfernandes.com",
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

	try
	{
		await client.send(new SendEmailCommand(params));
	}
	catch(e)
	{
		console.log(e);
	}
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