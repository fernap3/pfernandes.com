import dotenv from "dotenv";
dotenv.config();

import fs from "fs";
import { SESClient, SendEmailCommand } from "@aws-sdk/client-ses"

const sesClient = new SESClient({ region: "us-east-1"});

// node ./mailing-list-send.js list.csv en.json jp.json

const EMAIL_REGEX = /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/;

const csvFile = process.argv[2];
const englishBodyFile = process.argv[3];
const japaneseBodyFile = process.argv[4];

if (csvFile == null || englishBodyFile == null || japaneseBodyFile == null)
{
    printHelp();
    process.exit(1);
}

if (!process.argv[2].endsWith(".csv"))
{
    console.log("Second argument must be a CSV file with extension .csv")
    process.exit(1);
}

function printHelp()
{
    console.log("Usage: node ./mailing-list-send.js en.json jp.json")
}

const englishBodyJson = JSON.parse(fs.readFileSync(englishBodyFile, { encoding: "utf8" }));
const japaneseBodyJson = JSON.parse(fs.readFileSync(japaneseBodyFile, { encoding: "utf8" }));

if (!englishBodyJson.subject || !englishBodyJson.subject || !japaneseBodyJson.subject || !japaneseBodyJson.body)
{
    console.log("The second two files specified must be JSON files with 'subject' and 'body' properties.")
    process.exit(1);
}

class CSVReader
{
    csvText;
    csvLines;
    curLine = 0;

    constructor(fileName)
    {
        this.csvText = fs.readFileSync(fileName, { encoding: "utf8" });
        this.csvLines = this.csvText.split("\n");

        const header = this.csvLines[0];

        if (header.toLowerCase() !== "id,name,email,origin,language,unsubscribedat")
            throw new Error(`Error, expected first row to be headers "Name,Email,Origin,Language,UnsubscribedAt" but got ${header}`);

        this.curLine = 1; // Skip past the header
    }
    
    *nextLine()
    {
        while (this.csvLines[this.curLine] != null)
        {
            const lineText = this.csvLines[this.curLine];
            this.curLine += 1;
            yield lineText;
        }
    }
}



const reader = new CSVReader(csvFile);
let lineNum = 1;

for (const line of reader.nextLine())
{
    const [id, name, email, origin, language, unsubscribedat] = line.split(",").map(e => e.trim());

    if (unsubscribedat != null && unsubscribedat != "")
    {
        console.log(`Skipping ${email} since they unsubscribed`, line)
        lineNum += 1;
        continue;
    }

    if (language != "en" && language !== "jp")
        throw new Error(`'language' must be 'en' or 'jp' but got '${language}', line ${lineNum}`);

    if (!EMAIL_REGEX.test(email))
        throw new Error(`Email address is not valid (got '${email}'), line ${lineNum}`);

    // await sendEmail(email, id, language);
    await sendEmail("supersonicandtails@gmail.com", id, language);
    break;
    await wait(2000)
    
    lineNum += 1;
}

async function sendEmail(email, userId, language)
{
    console.log(`Emailing ${email}, ${language}`);

    const bodyText = (language === "en" ? englishBodyJson.body : japaneseBodyJson.body)
        .replaceAll("{{email}}", email)
        .replaceAll("{{user_id}}", userId);
    const subjectText = language === "en" ? englishBodyJson.subject : japaneseBodyJson.subject;

	const params = {
		Source: `"Peter Fernandes" <noreply@pfernandes.com>`,
		Destination: { ToAddresses: [email] },
		Message: {
			Body: {
				Html: {
					Charset: "UTF-8",
					Data: bodyText,
				}
			},
			Subject: {
				Charset: "UTF-8",
				Data: subjectText,
			}
		}
	};

	await sesClient.send(new SendEmailCommand(params));
}

function wait(ms)
{
    return new Promise(resolve => setTimeout(() => resolve(), ms));
}
