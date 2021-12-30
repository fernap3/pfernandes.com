import puppeteer from "puppeteer";
import path from "path";

const browser = await puppeteer.launch({
    headless: true
});

try
{
    const page = await browser.newPage();
    await page.goto("file://" + path.resolve(".", "resume.html"), { waitUntil: "networkidle2" });
    await page.pdf({ path: "resume.pdf" });
}
finally
{
    await browser.close();
}
