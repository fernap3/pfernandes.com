const dotenv = require("dotenv");
dotenv.config();

const path = require("path");

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

app.use(bodyParser.json());

app.get("/", (request, response) =>
{
	response.status(200).sendFile(path.resolve(".", "static", "index.html"));
});

app.use(express.static("static"));


const PORT = process.env.PORT || 5001;

app.listen(PORT, () => console.log(`Running on port ${PORT}`));