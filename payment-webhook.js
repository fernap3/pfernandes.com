const dotenv = require("dotenv");
dotenv.config();

const STRIPE_KEY = process.env.STRIPE_KEY;

if (!STRIPE_KEY)
{
    console.log("Must specify STRIPE_KEY variable in .env")
    process.exit(1);
}

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
  switch (event.type) {
    case "payment_intent.succeeded":
      const paymentIntent = event.data.object;
      console.log("PaymentIntent was successful!");
      break;
    case "payment_method.attached":
      const paymentMethod = event.data.object;
      console.log("PaymentMethod was attached to a Customer!");
      break;
    case "checkout.session.completed":
      const checkout = event.data.object;
      console.log("PaymentMethod was attached to a Customer!");
      break;
    case "customer.created":
      const customer = event.data.object;
      console.log("PaymentMethod was attached to a Customer!");
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
    let s3DownloadUrl = null;
    let successType = null;

    const productId = req.body.productId;

    switch (productId)
    {
        case "signed-cd":
            s3DownloadUrl = null;
            successType = "physical";
            break;
        case "sealed-cd":
            s3DownloadUrl = null;
            successType = "physical";
            break;
        case "album-download":
            s3DownloadUrl = getS3DownloadUrl("incline-audio");
            successType = "download";
            break;
        case "minus-one":
            s3DownloadUrl = getS3DownloadUrl("incline-minus-one");
            successType = "download";
            break;
        case "sheet-music":
            s3DownloadUrl = getS3DownloadUrl("incline-charts");
            successType = "download";
            break;
        default:
            res.status(400).send(`Bad product ID, ${productId}`)
            return;
    }

    let successUrl = `${req.get("origin")}/purchase-success.html?type=${successType}`;

    if (successType === "download")
        successUrl += `&downloadUrl=${encodeURIComponent(s3DownloadUrl)}`;
    
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


async function getS3DownloadUrl(key)
{

}


const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));