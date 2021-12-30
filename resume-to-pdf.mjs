import puppeteer from "puppeteer";

const browser = await puppeteer.launch({
    headless: true
});

try
{
    const page = await browser.newPage();
    await page.goto("http://localhost:8080/resume.html", { waitUntil: "networkidle2" });
    await page.pdf({ path: "resume.pdf" });
}
finally
{
    await browser.close();
}
