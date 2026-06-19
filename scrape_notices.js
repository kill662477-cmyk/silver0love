const fs = require("fs");
const path = require("path");
const puppeteer = require("puppeteer");

const TARGETS_FILE = path.join(__dirname, "targets.json");
const OUTPUT_ITEM_LIMIT = Math.max(40, Number(process.env.NOTICE_OUTPUT_ITEM_LIMIT || 40));
const OUTPUT_VISIBLE_COUNT = Math.max(20, Number(process.env.NOTICE_VISIBLE_COUNT || 20));

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

      function getPostHrefs(element) {
        if (!element) return [];

        return Array.from(
          element.querySelectorAll(`a[href*="/station/${targetInfo.userId}/post/"]`)
        )
          .map(link => link.href || link.getAttribute("href") || "")
          .filter(Boolean);
      }

      function countUniquePostLinks(element) {
        return new Set(getPostHrefs(element)).size;
      }

      function findCardRoot(anchor, href) {
        let node = anchor;
        let best = anchor.parentElement || anchor;

        // SOOP 목록 카드에는 제목 링크와 썸네일 링크처럼 같은 글을 가리키는
        // 링크가 둘 이상 있을 수 있다. 링크 태그 개수가 아니라 고유 게시글 URL
        // 개수를 기준으로 카드 전체 영역까지 올라간다.
        for (let depth = 0; node && depth < 14; depth += 1, node = node.parentElement) {
          if (!(node instanceof HTMLElement)) continue;

          const hrefs = getPostHrefs(node);
          const uniqueCount = new Set(hrefs).size;

          if (uniqueCount > 1) break;
          if (uniqueCount !== 1 || !hrefs.includes(href)) continue;

          best = node;
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

      function extractUrlFromText(text) {
        const value = String(text || "").trim();
        if (!value) return "";

        const cssMatch = value.match(/url\(["']?(.*?)["']?\)/i);
        return cssMatch ? cssMatch[1] : value;
      }

      function scoreThumbnailCandidate(url, element) {
        const rect = element.getBoundingClientRect();
        const naturalWidth = Number(element.naturalWidth || 0);
        const naturalHeight = Number(element.naturalHeight || 0);
        const width = Math.max(rect.width, naturalWidth);
        const height = Math.max(rect.height, naturalHeight);
        const text = [
          url,
          element.getAttribute("class"),
          element.getAttribute("alt"),
          element.getAttribute("title")
        ].join(" ").toLowerCase();

        let score = Math.max(width * height, 1);
        if (/(thumb|thumbnail|preview|attach|image|photo|bbs|normal_bbs|stimg)/i.test(text)) score += 100000;
        if (rect.width >= 45 && rect.height >= 45) score += 10000;
        return score;
      }

      function pushThumbnailCandidate(candidates, rawUrl, element) {
        const url = toAbsoluteUrl(extractUrlFromText(rawUrl));
        if (!url || isProbablyProfileOrIcon(url, element)) return;

        const rect = element.getBoundingClientRect();
        const naturalWidth = Number(element.naturalWidth || 0);
        const naturalHeight = Number(element.naturalHeight || 0);
        const width = Math.max(rect.width, naturalWidth);
        const height = Math.max(rect.height, naturalHeight);

        // 지연 로딩 이미지는 아직 크기가 0일 수 있으므로 URL이 있으면 후보로 둔다.
        // 단, 실제 크기가 확인되는 작은 아이콘은 제외한다.
        if (width > 0 && height > 0 && (width < 30 || height < 30)) return;

        candidates.push({
          url,
          score: scoreThumbnailCandidate(url, element)
        });
      }

      function pickProfileImage(card) {
        if (!card) return "";

        for (const img of Array.from(card.querySelectorAll("img"))) {
          const url = toAbsoluteUrl(readImageUrl(img));
          if (!url) continue;

          const text = [
            url,
            img.getAttribute("class"),
            img.getAttribute("alt"),
            img.getAttribute("title")
          ].join(" ").toLowerCase();

          if (/(profile|avatar|user[_-]?img|user[_-]?image)/i.test(text) || /profile\.img\.sooplive\.co\.kr/i.test(url)) {
            return url;
          }
        }

        return "";
      }

      function pickThumbnail(card) {
        if (!card) return "";

        const candidates = [];

        for (const img of Array.from(card.querySelectorAll("img"))) {
          pushThumbnailCandidate(candidates, readImageUrl(img), img);
        }

        for (const element of Array.from(card.querySelectorAll("*"))) {
          const attributeValues = [
            element.getAttribute("data-src"),
            element.getAttribute("data-lazy-src"),
            element.getAttribute("data-original"),
            element.getAttribute("data-image"),
            element.getAttribute("data-url"),
            element.getAttribute("data-thumb"),
            element.getAttribute("data-thumbnail"),
            element.getAttribute("style"),
            window.getComputedStyle(element).backgroundImage
          ];

          for (const rawValue of attributeValues) {
            pushThumbnailCandidate(candidates, rawValue, element);
          }
        }

        const deduped = Array.from(
          new Map(candidates.map(candidate => [candidate.url, candidate])).values()
        );
        deduped.sort((a, b) => b.score - a.score);
        return deduped[0]?.url || "";
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

      function compactText(text) {
        return normalize(text).replace(/\s+/g, "");
      }

      function pickAuthorName(card) {
        if (!card) return "";

        const scopes = [
          card.querySelector("[class*='PostHeader_postUserInfo']"),
          card
        ].filter(Boolean);
        const selectors = [
          "[class*='PostHeaderDetails_nick']",
          "[class*='nick']",
          "[class*='writer']",
          "[class*='author']"
        ];

        for (const scope of scopes) {
          for (const selector of selectors) {
            for (const element of Array.from(scope.querySelectorAll(selector))) {
              if (!isVisible(element)) continue;
              const text = normalize(element.innerText || element.textContent || "");
              if (text) return text;
            }
          }
        }

        const text = normalize(card.innerText || "");
        const boardName = normalize(targetInfo.boardName || "전체게시판");
        if (boardName) {
          const marker = ` ${boardName}`;
          const index = text.indexOf(marker);
          if (index > 0) return normalize(text.slice(0, index));
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

      function pickTitleAndContent(anchor, card, time, stationName) {
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
          "[class*='preview']"
        ];

        const samePostTextAnchors = Array.from(card?.querySelectorAll(`a[href="${anchor.href}"]`) || [])
          .map(link => uniqueTexts(splitLines(link.innerText)))
          .filter(lines => lines.length > 0)
          .sort((a, b) => a.join(" ").length - b.join(" ").length);
        const ownLines = uniqueTexts(splitLines(anchor.innerText));
        const cardLines = uniqueTexts(splitLines(card?.innerText || ""));

        let title = findTextBySelectors(card, titleSelectors);
        let content = findTextBySelectors(card, contentSelectors);

        // 제목 링크 자체에 텍스트가 있으면 그것을 가장 우선한다.
        if (!title && samePostTextAnchors.length >= 1) {
          title = samePostTextAnchors[0][0];
        }
        if (!title && ownLines.length >= 1) {
          title = ownLines[0];
        }

        // 일부 목록은 제목 링크 안에 본문 미리보기도 같이 넣는다.
        if (!content && samePostTextAnchors.length >= 1 && samePostTextAnchors[0].length >= 2) {
          content = samePostTextAnchors[0].slice(1).join(" ");
        }
        if (!content && ownLines.length >= 2) {
          content = ownLines.slice(1).join(" ");
        }

        if (!title || !content) {
          const filtered = cardLines.filter(line => {
            const text = normalize(line);
            if (isNoiseLine(text, time)) return false;
            if (text === normalize(stationName)) return false;
            if (text === normalize(title)) return false;
            return true;
          });

          if (!title && filtered.length >= 1) {
            title = filtered[0];
          }

          if (!content && filtered.length >= 1) {
            // 목록에 보이는 본문 미리보기만 저장한다. 상세 페이지는 열지 않는다.
            content = filtered.join(" ");
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

        return {
          title,
          content,
          // summary는 기존 인덱스 호환용 본문 요약이다. 제목을 섞지 않는다.
          summary: content
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

        const card = findCardRoot(a, href);
        const cardText = normalize(card?.innerText || "");
        const ownText = normalize(a.innerText || "");

        if (!cardText && !ownText) continue;

        const time = pickTime(cardText);
        const authorName = pickAuthorName(card);
        if (targetInfo.authorFilter === true) {
          const expectedAuthor = targetInfo.authorName || targetInfo.name;
          if (!authorName || compactText(authorName) !== compactText(expectedAuthor)) continue;
        }
        const text = pickTitleAndContent(a, card, time, targetInfo.name);

        result.push({
          stationName: targetInfo.name,
          writer: authorName || targetInfo.name,
          userId: targetInfo.userId,
          title: text.title,
          content: text.content,
          summary: text.summary,
          thumbnailUrl: pickThumbnail(card),
          profileUrl: pickProfileImage(card),
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

        // 기존 인덱스 호환용: summary는 목록에 보이는 본문 요약만 담는다.
        // 본문이 보이지 않는 공지는 빈 문자열로 유지한다.
        normalized.summary = cleanSummaryText(
          normalized.content || item.summary || "",
          normalized
        ).slice(0, 220);

        normalized.thumbnailUrl = String(item.thumbnailUrl || "").trim();
        normalized.profileUrl = String(item.profileUrl || "").trim();

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
    visibleCount: Math.min(OUTPUT_VISIBLE_COUNT, deduped.length),
    items: deduped.slice(0, OUTPUT_ITEM_LIMIT)
  };

  fs.writeFileSync("notices.json", JSON.stringify(output, null, 2), "utf-8");
  console.log("done");
}

main();
