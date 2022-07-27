const dotenv = require("dotenv");
dotenv.config();

const STRIPE_KEY = process.env.STRIPE_KEY;

if (!STRIPE_KEY)
{
	console.log("Must specify STRIPE_KEY variable in .env")
	process.exit(1);
}

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { S3Client, GetObjectCommand } = require("@aws-sdk/client-s3");


// Set your secret key. Remember to switch to your live secret key in production.
// See your keys here: https://dashboard.stripe.com/apikeys
const stripe = require("stripe")(STRIPE_KEY);

const app = require("express")();
const bodyParser = require("body-parser");

app.use(bodyParser.json());

// Match the raw body to content type application/json
app.post("/webhook", (request, response) =>
{
	const event = request.body;

	console.log(event)

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

	const productId = req.body.productId;

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
	console.log("Handling SALE. CHECKOUT SESSION:", checkoutSession)
	
	// const downloadUrl = await getS3DownloadUrl();
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


const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));