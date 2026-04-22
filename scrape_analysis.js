const puppeteer = require("puppeteer");

const TEST_TARGETS = [
  { name: "김윤환", userId: "brainzerg7", poongUrl: "https://poong.today/broadcast/brainzerg7" },
  { name: "비타밍", userId: "seemin88", poongUrl: "https://poong.today/broadcast/seemin88" }
];

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  for (const target of TEST_TARGETS) {
    const page = await browser.newPage();

    try {
      await page.setUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36"
      );

      await page.goto(target.poongUrl, {
        waitUntil: "networkidle2",
        timeout: 45000
      });

      await page.screenshot({ path: `${target.userId}.png`, fullPage: true });

      const title = await page.title();
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 1000));

      console.log("=====", target.name, "=====");
      console.log("TITLE:", title);
      console.log("BODY:", bodyText);
    } catch (e) {
      console.log("ERROR:", target.name, e.message);
    } finally {
      await page.close();
    }
  }

  await browser.close();
}

main().catch(console.error);
