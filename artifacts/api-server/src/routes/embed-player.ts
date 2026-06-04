import { Router } from "express";
import { db } from "@workspace/db";
import { embedsTable, adsTable, settingsTable, affiliateLinksTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";

const router = Router();

function toDoodEmbedUrl(url: string): string {
  if (!url) return url;
  const match = url.match(/dood\.[a-z]+\/(?:d|e|f|v|play)\/([a-zA-Z0-9]+)/);
  if (match) return `https://dood.stream/e/${match[1]}`;
  return url;
}

function toStreamtapeEmbedUrl(url: string): string {
  if (!url) return url;
  const match = url.match(/streamtape\.[a-z]+\/(?:v|e|d)\/([a-zA-Z0-9]+)/);
  if (match) return `https://streamtape.com/e/${match[1]}`;
  return url;
}

function toEmbedSrc(url: string): string {
  if (!url) return url;
  if (url.includes("streamtape")) return toStreamtapeEmbedUrl(url);
  return toDoodEmbedUrl(url);
}

function parseDomains(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed.filter((d) => typeof d === "string" && d.trim()).map((d) => d.trim());
  } catch {}
  return [];
}

async function getSeoSettings(): Promise<typeof settingsTable.$inferSelect | null> {
  try {
    const [settings] = await db.select().from(settingsTable).where(eq(settingsTable.id, 1));
    return settings ?? null;
  } catch {
    return null;
  }
}

function buildHomepageSeoHead(seo: typeof settingsTable.$inferSelect | null, host: string): string {
  const siteName = seo?.siteName?.trim() || host;
  const titleTemplate = seo?.siteTitle?.trim();
  const pageTitle = titleTemplate
    ? titleTemplate.replace("{title}", siteName).replace("{siteName}", siteName)
    : siteName;

  const desc = seo?.siteDescription?.trim() || "";
  const keywords = seo?.siteKeywords?.trim() || "";
  const ogImage = seo?.ogImage?.trim() || "";
  const faviconUrl = seo?.faviconUrl?.trim() || "";
  const twitterCard = seo?.twitterCard?.trim() || "summary_large_image";
  const twitterSite = seo?.twitterSite?.trim() || "";
  const robots = seo?.robotsIndex?.trim() || "index, follow";
  const gaId = seo?.googleAnalyticsId?.trim() || "";
  const gtmId = seo?.googleTagManagerId?.trim() || "";
  const pixelId = seo?.metaPixelId?.trim() || "";
  const customHead = seo?.customHeadHtml?.trim() || "";
  const pageUrl = `https://${host}/`;

  const e = escapeHtml;

  let head = `  <title>${e(pageTitle)}</title>\n`;
  head += `  <meta name="robots" content="${e(robots)}" />\n`;
  if (desc) head += `  <meta name="description" content="${e(desc)}" />\n`;
  if (keywords) head += `  <meta name="keywords" content="${e(keywords)}" />\n`;
  if (siteName) head += `  <meta name="author" content="${e(siteName)}" />\n`;

  head += `  <meta property="og:type" content="website" />\n`;
  head += `  <meta property="og:title" content="${e(pageTitle)}" />\n`;
  head += `  <meta property="og:url" content="${e(pageUrl)}" />\n`;
  if (desc) head += `  <meta property="og:description" content="${e(desc)}" />\n`;
  if (siteName) head += `  <meta property="og:site_name" content="${e(siteName)}" />\n`;
  if (ogImage) head += `  <meta property="og:image" content="${e(ogImage)}" />\n`;

  head += `  <meta name="twitter:card" content="${e(twitterCard)}" />\n`;
  head += `  <meta name="twitter:title" content="${e(pageTitle)}" />\n`;
  if (desc) head += `  <meta name="twitter:description" content="${e(desc)}" />\n`;
  if (ogImage) head += `  <meta name="twitter:image" content="${e(ogImage)}" />\n`;
  if (twitterSite) head += `  <meta name="twitter:site" content="${e(twitterSite)}" />\n`;

  if (faviconUrl) head += `  <link rel="icon" href="${e(faviconUrl)}" />\n`;

  if (gaId) {
    head += `  <script async src="https://www.googletagmanager.com/gtag/js?id=${e(gaId)}"></script>\n`;
    head += `  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${e(gaId)}');</script>\n`;
  }

  if (gtmId) {
    head += `  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${e(gtmId)}');</script>\n`;
  }

  if (pixelId) {
    head += `  <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${e(pixelId)}');fbq('track','PageView');</script>\n`;
    head += `  <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${e(pixelId)}&ev=PageView&noscript=1"/></noscript>\n`;
  }

  if (customHead) head += `  ${customHead}\n`;

  return head;
}

function buildHomepageHtml(seo: typeof settingsTable.$inferSelect | null, host: string, ads: typeof adsTable.$inferSelect[]): string {
  const siteName = seo?.siteName?.trim() || host;
  const titleTemplate = seo?.siteTitle?.trim();
  const pageTitle = titleTemplate
    ? titleTemplate.replace("{title}", siteName).replace("{siteName}", siteName)
    : siteName;
  const desc = seo?.siteDescription?.trim() || "";
  const ogImage = seo?.ogImage?.trim() || "";
  const faviconUrl = seo?.faviconUrl?.trim() || "";
  const gtmId = seo?.googleTagManagerId?.trim() || "";

  const seoHead = buildHomepageSeoHead(seo, host);
  const adsHtml = ads.map(buildAdHtml).join("\n");

  const e = escapeHtml;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${seoHead}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      min-height: 100%;
      background: #0a0a0a;
      color: #e0e0e0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      flex-direction: column;
    }
    .hero {
      flex: 1;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      text-align: center;
      padding: 60px 24px;
      min-height: 100vh;
    }
    .hero-logo {
      width: 90px;
      height: 90px;
      border-radius: 20px;
      object-fit: cover;
      margin-bottom: 28px;
      box-shadow: 0 0 40px rgba(0,229,255,0.25);
    }
    .hero-icon {
      font-size: 72px;
      margin-bottom: 24px;
      display: block;
      filter: drop-shadow(0 0 20px rgba(0,229,255,0.4));
    }
    .hero-name {
      font-size: clamp(28px, 6vw, 52px);
      font-weight: 800;
      letter-spacing: -1px;
      color: #fff;
      margin-bottom: 16px;
      background: linear-gradient(135deg, #00e5ff, #00b8d4);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }
    .hero-desc {
      font-size: clamp(14px, 2.5vw, 18px);
      color: #888;
      max-width: 500px;
      line-height: 1.6;
      margin-bottom: 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      font-size: 12px;
      color: #333;
    }
    ${buildAdsCss()}
  </style>
</head>
<body>
  ${gtmId ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${e(gtmId)}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : ""}
  ${adsHtml}
  <div class="hero">
    ${ogImage ? `<img class="hero-logo" src="${e(ogImage)}" alt="${e(siteName)}" />` : `<span class="hero-icon">&#127909;</span>`}
    <h1 class="hero-name">${e(pageTitle)}</h1>
    ${desc ? `<p class="hero-desc">${e(desc)}</p>` : ""}
  </div>
  <div class="footer">&copy; ${new Date().getFullYear()} ${e(siteName)}</div>
  <script>
    function adClick(adId, url) {
      fetch("/api/ads/" + adId + "/click", { method: "POST" }).catch(() => {});
    }
  </script>
</body>
</html>`;
}

function buildSeoHead(seo: typeof settingsTable.$inferSelect | null, embed: { title: string | null; code: string }, host: string): string {
  const siteName = seo?.siteName?.trim() || "";
  const rawTitle = embed.title?.trim() || "Watch Video";
  const titleTemplate = seo?.siteTitle?.trim();
  const pageTitle = titleTemplate
    ? titleTemplate.replace("{title}", rawTitle).replace("{siteName}", siteName)
    : (siteName ? `${rawTitle} | ${siteName}` : rawTitle);

  const desc = seo?.siteDescription?.trim() || "";
  const keywords = seo?.siteKeywords?.trim() || "";
  const ogImage = seo?.ogImage?.trim() || "";
  const faviconUrl = seo?.faviconUrl?.trim() || "";
  const twitterCard = seo?.twitterCard?.trim() || "summary_large_image";
  const twitterSite = seo?.twitterSite?.trim() || "";
  const robots = seo?.robotsIndex?.trim() || "index, follow";
  const gaId = seo?.googleAnalyticsId?.trim() || "";
  const gtmId = seo?.googleTagManagerId?.trim() || "";
  const pixelId = seo?.metaPixelId?.trim() || "";
  const customHead = seo?.customHeadHtml?.trim() || "";
  const pageUrl = `https://${host}/v/${embed.code}.mp4`;

  const e = escapeHtml;

  let head = `  <title>${e(pageTitle)}</title>\n`;
  head += `  <meta name="robots" content="${e(robots)}" />\n`;
  if (desc) head += `  <meta name="description" content="${e(desc)}" />\n`;
  if (keywords) head += `  <meta name="keywords" content="${e(keywords)}" />\n`;
  if (siteName) head += `  <meta name="author" content="${e(siteName)}" />\n`;

  head += `  <meta property="og:type" content="video.other" />\n`;
  head += `  <meta property="og:title" content="${e(pageTitle)}" />\n`;
  head += `  <meta property="og:url" content="${e(pageUrl)}" />\n`;
  if (desc) head += `  <meta property="og:description" content="${e(desc)}" />\n`;
  if (siteName) head += `  <meta property="og:site_name" content="${e(siteName)}" />\n`;
  if (ogImage) head += `  <meta property="og:image" content="${e(ogImage)}" />\n`;

  head += `  <meta name="twitter:card" content="${e(twitterCard)}" />\n`;
  head += `  <meta name="twitter:title" content="${e(pageTitle)}" />\n`;
  if (desc) head += `  <meta name="twitter:description" content="${e(desc)}" />\n`;
  if (ogImage) head += `  <meta name="twitter:image" content="${e(ogImage)}" />\n`;
  if (twitterSite) head += `  <meta name="twitter:site" content="${e(twitterSite)}" />\n`;

  if (faviconUrl) head += `  <link rel="icon" href="${e(faviconUrl)}" />\n`;

  if (gaId) {
    head += `  <script async src="https://www.googletagmanager.com/gtag/js?id=${e(gaId)}"></script>\n`;
    head += `  <script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','${e(gaId)}');</script>\n`;
  }

  if (gtmId) {
    head += `  <script>(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);})(window,document,'script','dataLayer','${e(gtmId)}');</script>\n`;
  }

  if (pixelId) {
    head += `  <script>!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${e(pixelId)}');fbq('track','PageView');</script>\n`;
    head += `  <noscript><img height="1" width="1" style="display:none" src="https://www.facebook.com/tr?id=${e(pixelId)}&ev=PageView&noscript=1"/></noscript>\n`;
  }

  if (customHead) head += `  ${customHead}\n`;

  return head;
}

async function getAdsForDomain(host: string): Promise<typeof adsTable.$inferSelect[]> {
  try {
    const allAds = await db.select().from(adsTable).where(eq(adsTable.isActive, 1));
    const cleanHost = host.replace(/:\d+$/, "");
    return allAds.filter((ad) => {
      const domains = parseDomains(ad.domains);
      if (domains.length === 0) return true;
      return domains.some((d) => d === cleanHost || cleanHost.endsWith(d));
    });
  } catch {
    return [];
  }
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function buildAdsCss(): string {
  return `
    /* === ADS === */
    .ad-banner-top, .ad-banner-bottom {
      position: fixed;
      left: 0; right: 0;
      z-index: 900;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 8px 16px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
      gap: 12px;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      cursor: pointer;
    }
    .ad-banner-top { top: 0; }
    .ad-banner-bottom { bottom: 0; }
    .ad-banner-img { height: 32px; width: auto; object-fit: contain; border-radius: 4px; }
    .ad-banner-text { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ad-banner-btn {
      padding: 5px 14px;
      border-radius: 6px;
      font-size: 12px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-transform: uppercase;
      border: 2px solid currentColor;
      white-space: nowrap;
      text-decoration: none;
      background: rgba(255,255,255,0.15);
    }
    .ad-banner-close {
      background: none;
      border: none;
      font-size: 16px;
      cursor: pointer;
      opacity: 0.6;
      line-height: 1;
      padding: 0 0 0 8px;
    }
    .ad-banner-close:hover { opacity: 1; }

    /* Floating button */
    .ad-floating {
      position: fixed;
      bottom: 24px;
      right: 20px;
      z-index: 910;
      display: none;
      flex-direction: column;
      align-items: flex-end;
      gap: 6px;
    }
    .ad-floating.show { display: flex; }
    .ad-floating-btn {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 12px 20px;
      border-radius: 50px;
      font-size: 14px;
      font-weight: 800;
      letter-spacing: 0.5px;
      text-decoration: none;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
      transition: transform 0.15s, box-shadow 0.15s;
      text-transform: uppercase;
    }
    .ad-floating-btn:hover { transform: scale(1.05); box-shadow: 0 6px 28px rgba(0,0,0,0.6); }
    .ad-floating-img { height: 22px; width: auto; object-fit: contain; border-radius: 3px; }
    .ad-floating-close {
      background: rgba(0,0,0,0.6);
      border: none;
      color: #fff;
      border-radius: 50%;
      width: 20px; height: 20px;
      font-size: 10px;
      cursor: pointer;
      display: flex; align-items: center; justify-content: center;
    }

    /* Interstitial */
    .ad-interstitial {
      position: fixed;
      inset: 0;
      z-index: 1100;
      display: none;
      align-items: center;
      justify-content: center;
      background: rgba(0,0,0,0.88);
    }
    .ad-interstitial.show { display: flex; }
    .ad-interstitial-box {
      background: #111;
      border: 1px solid #333;
      border-radius: 16px;
      padding: 36px 28px;
      max-width: 420px;
      width: 92%;
      text-align: center;
      position: relative;
      box-shadow: 0 0 60px rgba(0,0,0,0.8);
    }
    .ad-interstitial-img {
      max-width: 100%;
      max-height: 160px;
      object-fit: contain;
      border-radius: 8px;
      margin-bottom: 16px;
    }
    .ad-interstitial-title { font-size: 18px; font-weight: 700; margin-bottom: 8px; }
    .ad-interstitial-btn {
      display: inline-block;
      padding: 12px 32px;
      border-radius: 8px;
      font-weight: 800;
      font-size: 15px;
      text-decoration: none;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-top: 20px;
      transition: opacity 0.2s;
    }
    .ad-interstitial-btn:hover { opacity: 0.85; }
    .ad-interstitial-skip {
      margin-top: 14px;
      font-size: 12px;
      color: #555;
    }
    .ad-interstitial-close {
      position: absolute;
      top: 12px; right: 14px;
      background: none; border: none;
      color: #555; font-size: 20px;
      cursor: pointer; line-height: 1;
    }
    .ad-interstitial-close:hover { color: #fff; }
    .ad-interstitial-close:disabled { opacity: 0.3; cursor: not-allowed; }
  `;
}

function buildAdHtml(ad: typeof adsTable.$inferSelect): string {
  const safeLink = escapeHtml(ad.targetUrl);
  const safeName = escapeHtml(ad.name);
  const safeBtn = escapeHtml(ad.buttonText);
  const safeImg = ad.imageUrl ? escapeHtml(ad.imageUrl) : "";
  const bg = escapeHtml(ad.bgColor);
  const fg = escapeHtml(ad.textColor);
  const adId = `ad-${ad.id}`;

  if (ad.type === "banner-top" || ad.type === "banner-bottom") {
    const cls = ad.type === "banner-top" ? "ad-banner-top" : "ad-banner-bottom";
    return `
    <div class="${cls}" id="${adId}" style="background:${bg};color:${fg};" onclick="adClick(${ad.id},'${safeLink}')">
      ${safeImg ? `<img class="ad-banner-img" src="${safeImg}" alt="" />` : ""}
      <span class="ad-banner-text">${safeName}</span>
      <a class="ad-banner-btn" href="${safeLink}" target="_blank" rel="noopener" style="color:${fg}" onclick="event.stopPropagation();adClick(${ad.id},'${safeLink}')">${safeBtn}</a>
      <button class="ad-banner-close" style="color:${fg}" onclick="event.stopPropagation();document.getElementById('${adId}').remove()">&#x2715;</button>
    </div>`;
  }

  if (ad.type === "floating-btn") {
    return `
    <div class="ad-floating" id="${adId}">
      <button class="ad-floating-close" onclick="document.getElementById('${adId}').remove()">&#x2715;</button>
      <a class="ad-floating-btn" href="${safeLink}" target="_blank" rel="noopener" style="background:${bg};color:${fg}" onclick="adClick(${ad.id},'${safeLink}')">
        ${safeImg ? `<img class="ad-floating-img" src="${safeImg}" alt="" />` : ""}
        ${safeBtn}
      </a>
    </div>
    <script>setTimeout(function(){var el=document.getElementById('${adId}');if(el)el.classList.add('show');},${ad.showDelaySec * 1000});</script>`;
  }

  if (ad.type === "interstitial") {
    const closeDelay = ad.closeDelaySec > 0 ? ad.closeDelaySec : 0;
    return `
    <div class="ad-interstitial" id="${adId}">
      <div class="ad-interstitial-box">
        <button class="ad-interstitial-close" id="${adId}-close" onclick="document.getElementById('${adId}').remove()" ${closeDelay > 0 ? "disabled" : ""}>&#x2715;</button>
        ${safeImg ? `<img class="ad-interstitial-img" src="${safeImg}" alt="" />` : ""}
        <div class="ad-interstitial-title" style="color:#fff">${safeName}</div>
        <a class="ad-interstitial-btn" href="${safeLink}" target="_blank" rel="noopener" style="background:${bg};color:${fg}" onclick="adClick(${ad.id},'${safeLink}')">${safeBtn}</a>
        ${closeDelay > 0 ? `<div class="ad-interstitial-skip">Bisa ditutup dalam <span id="${adId}-cd">${closeDelay}</span>s</div>` : ""}
      </div>
    </div>
    <script>
    (function(){
      setTimeout(function(){
        var el=document.getElementById('${adId}');
        if(el) el.classList.add('show');
        ${closeDelay > 0 ? `
        var cd=${closeDelay};
        var t=setInterval(function(){
          cd--;
          var span=document.getElementById('${adId}-cd');
          if(span) span.textContent=cd;
          if(cd<=0){
            clearInterval(t);
            var btn=document.getElementById('${adId}-close');
            if(btn) btn.disabled=false;
          }
        },1000);` : ""}
      }, ${ad.showDelaySec * 1000});
    })();
    </script>`;
  }

  return "";
}

function buildEmbedHtml(embed: {
  code: string;
  title: string | null;
  doodUrl: string;
  customLink: string;
  popupDelay: number;
  popupInterval: number;
  popupOnClick: number;
}, host: string, ads: typeof adsTable.$inferSelect[], seo: typeof settingsTable.$inferSelect | null): string {
  const embedSrc = toEmbedSrc(embed.doodUrl);
  const safeLink = embed.customLink.replace(/"/g, "&quot;");
  const popupDelayMs = embed.popupDelay * 1000;
  const popupIntervalMs = embed.popupInterval * 1000;

  const adsHtml = ads.map(buildAdHtml).join("\n");
  const hasTopBanner = ads.some((a) => a.type === "banner-top");
  const hasBottomBanner = ads.some((a) => a.type === "banner-bottom");
  const playerTop = hasTopBanner ? "top: 42px;" : "top: 0;";
  const playerBottom = hasBottomBanner ? "bottom: 42px;" : "bottom: 0;";

  const seoHead = buildSeoHead(seo, embed, host);
  const gtmId = seo?.googleTagManagerId?.trim() || "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
${seoHead}
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html, body { height: 100%; background: #000; overflow: hidden; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    #player-wrap {
      position: fixed;
      left: 0; right: 0;
      ${playerTop}
      ${playerBottom}
    }
    #dood-frame {
      width: 100%;
      height: 100%;
      border: none;
      display: block;
    }
    #click-overlay {
      position: absolute;
      inset: 0;
      cursor: pointer;
      z-index: 10;
      background: transparent;
    }
    /* ---- POPUP ---- */
    #popup-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      z-index: 1000;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      pointer-events: none;
      transition: opacity 0.3s ease;
    }
    #popup-backdrop.show {
      opacity: 1;
      pointer-events: all;
    }
    #popup-box {
      background: #111;
      border: 1px solid #00e5ff;
      border-radius: 12px;
      padding: 32px 28px;
      max-width: 380px;
      width: 90%;
      text-align: center;
      box-shadow: 0 0 40px rgba(0,229,255,0.2);
      position: relative;
      transform: scale(0.9);
      transition: transform 0.3s ease;
    }
    #popup-backdrop.show #popup-box {
      transform: scale(1);
    }
    #popup-close {
      position: absolute;
      top: 12px;
      right: 16px;
      background: none;
      border: none;
      color: #666;
      font-size: 20px;
      cursor: pointer;
      line-height: 1;
    }
    #popup-close:hover { color: #fff; }
    #popup-icon {
      font-size: 44px;
      margin-bottom: 12px;
      display: block;
    }
    #popup-title {
      color: #fff;
      font-size: 18px;
      font-weight: 700;
      margin-bottom: 8px;
      letter-spacing: 0.5px;
    }
    #popup-desc {
      color: #888;
      font-size: 14px;
      margin-bottom: 24px;
      line-height: 1.5;
    }
    #popup-btn {
      display: inline-block;
      background: #00e5ff;
      color: #000;
      font-weight: 800;
      font-size: 15px;
      padding: 12px 32px;
      border-radius: 8px;
      text-decoration: none;
      letter-spacing: 1px;
      text-transform: uppercase;
      transition: background 0.2s, transform 0.1s;
    }
    #popup-btn:hover { background: #00c4d9; transform: scale(1.03); }
    #popup-timer {
      margin-top: 14px;
      font-size: 12px;
      color: #444;
    }
    #countdown { color: #00e5ff; font-weight: 700; }
    ${buildAdsCss()}
  </style>
</head>
<body>
  ${gtmId ? `<noscript><iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe></noscript>` : ""}
  ${adsHtml}

  <div id="player-wrap">
    <iframe
      id="dood-frame"
      src="${embedSrc}"
      allowfullscreen
      allow="autoplay; fullscreen; picture-in-picture"
      scrolling="no"
    ></iframe>
    <div id="click-overlay"></div>
  </div>

  <!-- POPUP -->
  <div id="popup-backdrop">
    <div id="popup-box">
      <button id="popup-close" onclick="closePopup()">&#x2715;</button>
      <span id="popup-icon">&#127909;</span>
      <div id="popup-title">Special Content Waiting</div>
      <div id="popup-desc">Check out exclusive content just for you. Don't miss out!</div>
      <a id="popup-btn" href="${safeLink}" target="_blank" rel="noopener" onclick="trackClick()">Visit Now</a>
      <div id="popup-timer">Auto-reopens in <span id="countdown">--</span>s</div>
    </div>
  </div>

  <script>
    const CUSTOM_LINK = "${safeLink}";
    const POPUP_ON_CLICK = ${embed.popupOnClick === 1 ? "true" : "false"};
    const POPUP_DELAY_MS = ${popupDelayMs};
    const POPUP_INTERVAL_MS = ${popupIntervalMs};
    const EMBED_CODE = "${embed.code}";

    let popupClosed = false;
    let countdownTimer = null;
    let countdownVal = 0;
    let reopenTimer = null;
    let firstShown = false;

    function showPopup() {
      document.getElementById("popup-backdrop").classList.add("show");
      popupClosed = false;
      startCountdown();
    }

    function closePopup() {
      document.getElementById("popup-backdrop").classList.remove("show");
      popupClosed = true;
      clearInterval(countdownTimer);
      scheduleReopen();
    }

    function startCountdown() {
      clearInterval(countdownTimer);
      countdownVal = Math.round(POPUP_INTERVAL_MS / 1000);
      document.getElementById("countdown").textContent = countdownVal;
      countdownTimer = setInterval(() => {
        countdownVal--;
        document.getElementById("countdown").textContent = countdownVal;
        if (countdownVal <= 0) {
          clearInterval(countdownTimer);
        }
      }, 1000);
    }

    function scheduleReopen() {
      clearTimeout(reopenTimer);
      reopenTimer = setTimeout(() => {
        showPopup();
      }, POPUP_INTERVAL_MS);
    }

    function trackClick() {
      fetch("/api/embeds/" + EMBED_CODE + "/click", { method: "POST" }).catch(() => {});
    }

    function adClick(adId, url) {
      fetch("/api/ads/" + adId + "/click", { method: "POST" }).catch(() => {});
    }

    // Click overlay — redirect or popup on video click
    document.getElementById("click-overlay").addEventListener("click", function() {
      this.style.display = "none";
      if (POPUP_ON_CLICK) {
        window.open(CUSTOM_LINK, "_blank", "noopener,noreferrer");
        trackClick();
      } else {
        showPopup();
      }
    });

    // Track view
    fetch("/api/embeds/" + EMBED_CODE + "/view", { method: "POST" }).catch(() => {});

    // First popup after delay
    if (POPUP_DELAY_MS === 0) {
      setTimeout(() => {
        if (!firstShown) {
          firstShown = true;
          showPopup();
        }
      }, 5000);
    } else {
      setTimeout(() => {
        firstShown = true;
        showPopup();
      }, POPUP_DELAY_MS);
    }
  </script>
</body>
</html>`;
}

function extractCode(raw: string): string {
  return raw.replace(/\.mp4$/i, "");
}

router.get("/", async (req, res) => {
  const host = req.get("host") ?? "localhost";
  const [seo, ads] = await Promise.all([getSeoSettings(), getAdsForDomain(host)]);
  res.setHeader("Content-Type", "text/html");
  res.send(buildHomepageHtml(seo, host, ads));
});

router.get("/v/:code", async (req, res) => {
  const code = extractCode(req.params.code);
  const [embed] = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
  if (!embed) {
    return res.status(404).send("<h1>404 - Embed not found</h1>");
  }
  const host = req.get("host") ?? "localhost";
  const [ads, seo] = await Promise.all([getAdsForDomain(host), getSeoSettings()]);
  res.setHeader("Content-Type", "text/html");
  res.send(buildEmbedHtml(embed, host, ads, seo));
});

router.get("/r/:code", async (req, res) => {
  const code = extractCode(req.params.code);

  // Check embeds first
  const [embed] = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
  if (embed) {
    await db.update(embedsTable).set({
      clicks: sql`${embedsTable.clicks} + 1`,
    }).where(eq(embedsTable.id, embed.id));
    return res.redirect(302, embed.customLink);
  }

  // Check affiliate links
  try {
    const [affiliate] = await db.select().from(affiliateLinksTable).where(eq(affiliateLinksTable.code, code));
    if (affiliate && affiliate.isActive) {
      await db.update(affiliateLinksTable).set({
        clicks: sql`${affiliateLinksTable.clicks} + 1`,
      }).where(eq(affiliateLinksTable.id, affiliate.id));

      // Use JS redirect to hide destination URL from link previews and referrer
      const safeUrl = affiliate.destinationUrl.replace(/"/g, "&quot;").replace(/</g, "&lt;");
      res.setHeader("Content-Type", "text/html");
      return res.send(`<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="robots" content="noindex"><meta http-equiv="refresh" content="0;url=${safeUrl}"><title>Redirecting...</title><style>body{background:#000;color:#fff;font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}</style></head><body><p>Redirecting...</p><script>window.location.replace("${safeUrl}");</script></body></html>`);
    }
  } catch {
    // Table might not exist yet, ignore
  }

  return res.status(404).send("Not found");
});

router.post("/api/embeds/:code/view", async (req, res) => {
  const { code } = req.params;
  const [embed] = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
  if (!embed) return res.status(404).json({ ok: false });
  await db.update(embedsTable).set({
    views: sql`${embedsTable.views} + 1`,
  }).where(eq(embedsTable.id, embed.id));
  res.json({ ok: true });
});

router.post("/api/embeds/:code/click", async (req, res) => {
  const { code } = req.params;
  const [embed] = await db.select().from(embedsTable).where(eq(embedsTable.code, code));
  if (!embed) return res.status(404).json({ ok: false });
  await db.update(embedsTable).set({
    clicks: sql`${embedsTable.clicks} + 1`,
  }).where(eq(embedsTable.id, embed.id));
  res.json({ ok: true });
});

router.post("/api/ads/:id/click", async (req, res) => {
  const id = Number(req.params.id);
  res.json({ ok: true });
});

export default router;
