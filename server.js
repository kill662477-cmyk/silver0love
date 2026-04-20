const express = require("express");
const puppeteer = require("puppeteer");

const app = express();
const PORT = process.env.PORT || 10000;

let browser = null;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getBrowser() {
  if (browser) return browser;

  browser = await puppeteer.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--single-process"
    ]
  });

  return browser;
}

app.get("/", (req, res) => {
  res.send("OK");
});

app.get("/notices", async (req, res) => {
  const targetUrl = "https://www.sooplive.com/station/soju2022/board/94261720";

  try {
    const browser = await getBrowser();
    const page = await browser.newPage();

    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
    );

    // 무거운 리소스 차단
    await page.setRequestInterception(true);
    page.on("request", (request) => {
      const type = request.resourceType();
      if (["image", "media", "font"].includes(type)) {
        request.abort();
      } else {
        request.continue();
      }
    });

    await page.goto(targetUrl, {
      waitUntil: "domcontentloaded",
      timeout: 45000
    });

    await sleep(3000);

    const data = await page.evaluate(() => {
      return {
        title: document.title,
        bodyPreview: (document.body?.innerText || "")
          .replace(/\s+/g, " ")
          .slice(0, 500),
        linkCount: document.querySelectorAll("a").length
      };
    });

    await page.close();

    res.json({
      ok: true,
      url: targetUrl,
      ...data
    });
  } catch (e) {
    res.status(500).json({
      ok: false,
      url: targetUrl,
      error: e.message
    });
  }
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on ${PORT}`);
});