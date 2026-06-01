const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const TARGETS_FILE = path.join(__dirname, "targets.json");

function loadTargets() {
  try {
    const raw = JSON.parse(fs.readFileSync(TARGETS_FILE, "utf-8"));
    const list = Array.isArray(raw) ? raw : (raw.items || []);

    console.log("TARGETS loaded:", list.length);

    return list;
  } catch (e) {
    console.error("targets.json 읽기 실패:", e.message);
    return [];
  }
}

const TARGETS = loadTargets()
  .filter(t => t.enabled !== false)
  .filter(t => t.noticeEnabled !== false)
  .filter(t => t.name && t.userId && t.bbsNo);

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function cleanText(text) {
  return String(text || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeRegExp(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getPostNo(link) {
  const m = String(link || "").match(/\/post\/(\d+)/);
  return m ? Number(m[1]) : 0;
}

function normalizeTimeText(text) {
  const t = String(text || "").trim();
  if (!t) return "";

  const kr = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
  if (kr) return kr[1].replace(/\s+/g, "");

  const en = t.match(
    /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
  );
  if (en) return en[1].replace(/\s+/g, " ").trim();

  const abs = t.match(
    /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
  );
  if (abs) {
    return abs[1]
      .replace(/\//g, "-")
      .replace(/\./g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  return "";
}

function removeTimeText(text, time) {
  let result = cleanText(text);
  if (!result || !time) return result;

  const escaped = escapeRegExp(time);
  return result
    .replace(new RegExp(escaped, "gi"), " ")
    .replace(/\s+/g, " ")
    .trim();
}

function removeLeadingTitle(text, title) {
  let result = cleanText(text);
  const normalizedTitle = cleanText(title);

  if (!result || !normalizedTitle) return result;

  const escaped = escapeRegExp(normalizedTitle);
  result = result.replace(new RegExp(`^${escaped}(?:\\s+|$)`, "i"), "");

  return result.replace(/\s+/g, " ").trim();
}

function cleanSummaryText(summary, item) {
  return removeTimeText(summary, item.time);
}

async function crawlTarget(browser, target) {
  const page = await browser.newPage();
  const url = `https://www.sooplive.com/station/${target.userId}/board/${target.bbsNo}`;

  try {
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
      "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
    );

    await page.goto(url, {
      waitUntil: "networkidle2",
      timeout: 45000
    });

    await sleep(2500);

    const items = await page.evaluate((targetInfo) => {
      function normalize(str) {
        return String(str || "").replace(/\s+/g, " ").trim();
      }

      function splitLines(str) {
        return String(str || "")
          .replace(/\r/g, "\n")
          .split(/\n+/)
          .map(normalize)
          .filter(Boolean);
      }

      function uniqueTexts(texts) {
        const result = [];
        const seen = new Set();

        for (const text of texts) {
          const normalized = normalize(text);
          if (!normalized || seen.has(normalized)) continue;
          seen.add(normalized);
          result.push(normalized);
        }

        return result;
      }

      function pickTime(text) {
        const t = normalize(text);

        const kr = t.match(/(\d+\s*(초|분|시간|일|주|개월|달|년)\s*전)/i);
        if (kr) return kr[1].replace(/\s+/g, "");

        const en = t.match(
          /(\d+\s*(second|seconds|minute|minutes|hour|hours|day|days|week|weeks|month|months|year|years)\s+ago)/i
        );
        if (en) return en[1].replace(/\s+/g, " ").trim();

        const abs = t.match(
          /(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2}(?:\s+\d{1,2}:\d{2})?)/
        );
        if (abs) {
          return abs[1]
            .replace(/\//g, "-")
            .replace(/\./g, "-")
            .replace(/\s+/g, " ")
            .trim();
        }

        return "";
      }

      function getPostNoFromHref(href) {
        const m = String(href || "").match(/\/post\/(\d+)/);
        return m ? Number(m[1]) : 0;
      }

      function countPostLinks(element) {
        if (!element) return 0;
        return element.querySelectorAll(
          `a[href*="/station/${targetInfo.userId}/post/"]`
        ).length;
      }

      function findCardRoot(anchor) {
        let node = anchor;
        let best = anchor.parentElement || anchor;

        for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
          if (!(node instanceof HTMLElement)) continue;

          const linkCount = countPostLinks(node);
          if (linkCount !== 1) continue;

          best = node;

          const tag = node.tagName.toLowerCase();
          const className = String(node.className || "").toLowerCase();
          const looksLikeCard =
            tag === "li" ||
            tag === "article" ||
            /(post|board|notice|feed|item|list|card)/i.test(className);

          if (looksLikeCard && normalize(node.innerText).length > normalize(anchor.innerText).length) {
            return node;
          }
        }

        return best;
      }

      function isVisible(element) {
        if (!(element instanceof HTMLElement)) return false;
        const style = window.getComputedStyle(element);
        const rect = element.getBoundingClientRect();

        return (
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          Number(style.opacity || "1") !== 0 &&
          rect.width > 0 &&
          rect.height > 0
        );
      }

      function readImageUrl(img) {
        const raw =
          img.currentSrc ||
          img.getAttribute("src") ||
          img.getAttribute("data-src") ||
          img.getAttribute("data-lazy-src") ||
          img.getAttribute("data-original") ||
          "";

        if (raw) return raw;

        const srcset = img.getAttribute("srcset") || img.getAttribute("data-srcset") || "";
        if (!srcset) return "";

        return srcset
          .split(",")
          .map(part => part.trim().split(/\s+/)[0])
          .filter(Boolean)
          .pop() || "";
      }

      function toAbsoluteUrl(rawUrl) {
        const value = String(rawUrl || "").trim();
        if (!value || value.startsWith("data:")) return "";

        try {
          return new URL(value, window.location.href).href;
        } catch {
          return "";
        }
      }

      function isProbablyProfileOrIcon(url, img) {
        const text = [
          url,
          img.getAttribute("class"),
          img.getAttribute("alt"),
          img.getAttribute("title")
        ].join(" ").toLowerCase();

        return /(profile|avatar|user[_-]?img|user[_-]?image|emoticon|emoji|icon|badge|logo|ico)/i.test(text) ||
          /profile\.img\.sooplive\.co\.kr/i.test(url);
      }

      function pickThumbnail(card) {
        if (!card) return "";

        const candidates = [];

        for (const img of Array.from(card.querySelectorAll("img"))) {
          if (!isVisible(img)) continue;

          const url = toAbsoluteUrl(readImageUrl(img));
          if (!url || isProbablyProfileOrIcon(url, img)) continue;

          const rect = img.getBoundingClientRect();
          const width = Math.max(rect.width, Number(img.naturalWidth || 0));
          const height = Math.max(rect.height, Number(img.naturalHeight || 0));

          if (width < 45 || height < 45) continue;

          candidates.push({
            url,
            score: width * height
          });
        }

        for (const element of Array.from(card.querySelectorAll("*"))) {
          if (!isVisible(element)) continue;

          const bg = window.getComputedStyle(element).backgroundImage || "";
          const m = bg.match(/url\(["']?(.*?)["']?\)/i);
          if (!m) continue;

          const url = toAbsoluteUrl(m[1]);
          if (!url || /(profile|avatar|icon|badge|logo|ico)/i.test(url)) continue;

          const rect = element.getBoundingClientRect();
          if (rect.width < 45 || rect.height < 45) continue;

          candidates.push({
            url,
            score: rect.width * rect.height
          });
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates[0]?.url || "";
      }

      function findTextBySelectors(card, selectors) {
        if (!card) return "";

        for (const selector of selectors) {
          for (const element of Array.from(card.querySelectorAll(selector))) {
            if (!isVisible(element)) continue;

            const text = normalize(element.innerText || element.textContent || "");
            if (text) return text;
          }
        }

        return "";
      }

      function isNoiseLine(line, time) {
        const text = normalize(line);
        if (!text) return true;
        if (time && text === time) return true;
        if (/^[\d\s,.:/+-]+$/.test(text)) return true;
        if (/^(조회|댓글|추천|좋아요|view|comment|like)\s*[:：]?\s*[\d,]*$/i.test(text)) return true;
        return false;
      }

      function pickTitleAndContent(anchor, card, time) {
        const titleSelectors = [
          "[class*='subject']",
          "[class*='title']",
          "[class*='tit']",
          "h1",
          "h2",
          "h3"
        ];

        const contentSelectors = [
          "[class*='summary']",
          "[class*='content']",
          "[class*='desc']",
          "[class*='body']",
          "[class*='cont']",
          "[class*='text']"
        ];

        const ownLines = uniqueTexts(splitLines(anchor.innerText));
        const cardLines = uniqueTexts(splitLines(card?.innerText || ""));

        let title = findTextBySelectors(card, titleSelectors);
        let content = findTextBySelectors(card, contentSelectors);

        if (!title && ownLines.length >= 1) {
          title = ownLines[0];
        }

        if (!content && ownLines.length >= 2) {
          content = ownLines.slice(1).join(" ");
        }

        if (!title || !content) {
          const filtered = cardLines.filter(line => !isNoiseLine(line, time));

          if (!title && filtered.length >= 1) {
            title = filtered[0];
          }

          if (!content && filtered.length >= 2) {
            const titleIndex = filtered.findIndex(line => normalize(line) === normalize(title));
            content = filtered
              .filter((_, index) => index !== titleIndex)
              .join(" ");
          }
        }

        title = normalize(title);
        content = normalize(content);

        if (title && content.startsWith(title)) {
          content = normalize(content.slice(title.length));
        }

        if (time) {
          title = normalize(title.replace(time, " "));
          content = normalize(content.replace(time, " "));
        }

        const summary = normalize([title, content].filter(Boolean).join(" "));

        return {
          title,
          content,
          summary: summary || normalize(anchor.innerText || card?.innerText || "")
        };
      }

      const anchors = Array.from(
        document.querySelectorAll(`a[href*="/station/${targetInfo.userId}/post/"]`)
      );

      const result = [];
      const seen = new Set();

      for (const a of anchors) {
        const href = a.href || "";
        if (!href || seen.has(href)) continue;
        seen.add(href);

        const card = findCardRoot(a);
        const cardText = normalize(card?.innerText || "");
        const ownText = normalize(a.innerText || "");

        if (!cardText && !ownText) continue;

        const time = pickTime(cardText);
        const text = pickTitleAndContent(a, card, time);

        result.push({
          stationName: targetInfo.name,
          writer: targetInfo.name,
          userId: targetInfo.userId,
          title: text.title,
          content: text.content,
          summary: text.summary,
          thumbnailUrl: pickThumbnail(card),
          time,
          link: href,
          postNo: getPostNoFromHref(href)
        });
      }

      // 게시판 DOM 순서는 오래된 고정공지가 먼저일 수 있다.
      // 글번호 기준으로 재정렬한 뒤 최신 5개만 남긴다.
      return result
        .sort((a, b) => b.postNo - a.postNo)
        .slice(0, 5);
    }, target);

    return {
      ok: true,
      userId: target.userId,
      items: items.map(item => {
        const normalized = {
          stationName: item.stationName,
          writer: item.writer,
          userId: item.userId,
          time: normalizeTimeText(item.time),
          link: item.link,
          postNo: getPostNo(item.link)
        };

        normalized.title = removeTimeText(item.title, normalized.time).slice(0, 120);
        normalized.content = removeLeadingTitle(
          removeTimeText(item.content, normalized.time),
          normalized.title
        ).slice(0, 500);

        // 기존 인덱스 호환용: 지금까지 사용하던 summary 필드는 유지한다.
        // 추후 인덱스 수정 시 title과 content를 각각 사용하면 된다.
        normalized.summary = cleanSummaryText(
          [normalized.title, normalized.content].filter(Boolean).join(" ") || item.summary,
          normalized
        ).slice(0, 220);

        normalized.thumbnailUrl = String(item.thumbnailUrl || "").trim();

        return normalized;
      })
    };
  } catch (error) {
    return {
      ok: false,
      userId: target.userId,
      error: error.message,
      items: []
    };
  } finally {
    await page.close();
  }
}

async function main() {
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox"]
  });

  const collected = [];

  for (const target of TARGETS) {
    const result = await crawlTarget(browser, target);
    if (result.ok) collected.push(...result.items);
    await sleep(1000);
  }

  await browser.close();

  const deduped = Array.from(new Map(collected.map(i => [i.link, i])).values());
  deduped.sort((a, b) => b.postNo - a.postNo);

  const output = {
    checkedAt: new Date().toISOString(),
    visibleCount: 20,
    items: deduped.slice(0, 40)
  };

  fs.writeFileSync("notices.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("done");
}

main();
