import puppeteer from "puppeteer";
import path from "path";

const browser = await puppeteer.launch({
    headless: true
});

try
{
    const page = await browser.newPage();
    await page.goto("file://" + path.resolve(".", "static/resume.html"), { waitUntil: "networkidle2" });
    await page.pdf({ path: "static/resume.pdf" });
}
finally
{
    await browser.close();
}
