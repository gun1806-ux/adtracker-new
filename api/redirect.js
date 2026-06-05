import fs from 'fs';
import path from 'path';
import firebaseConfig from './firebase-config-local.js';

function isBotOrPrefetch(headers) {
  const userAgent = headers['user-agent'] || '';
  const purpose = headers['purpose'] || headers['x-purpose'] || headers['sec-purpose'] || headers['x-moz'] || '';
  
  // 1. Check background speculative prefetch / preview headers
  if (/prefetch|preview/i.test(purpose)) {
    return true;
  }
  
  // 2. Check automated bot / crawler / link preview scraper keywords
  // (We exclude plain "naver" or "kakaotalk" to allow real in-app mobile browsers)
  const botKeywords = [
    'bot', 'crawler', 'spider', 'scrap', 'crawl', 'lighthouse', 'headless', 
    'facebookexternalhit', 'facebot', 'slackbot', 'telegram', 'discord', 'whatsapp', 
    'twitterbot', 'linkedinbot', 'embedly', 'mediapartners', 'adsbot', 'ping',
    'google-webrender', 'vkshare', 'w3c_validator', 'baiduspider', 'yeti', 
    'python-requests', 'axios', 'curl', 'wget', 'http-client',
    'preview', 'embed', 'fetcher', 'link-analyzer', 'url-resolver',
    'karrot', 'daangn', 'dangn', 'carrot', 'robot', 'inspection', 'audit', 'ad-review', 
    'validator', 'monitor', 'probe', 'scoot', 'pingdom', 'uptimerobot', 'synapse', 
    'check', 'url', 'verify', 'screenshot', 'headlesschrome', 'selenium', 'puppeteer', 
    'playwright', 'electron'
  ];
  
  const uaLower = userAgent.toLowerCase();
  return botKeywords.some(keyword => uaLower.includes(keyword));
}

export default async function handler(req, res) {
  // Disable aggressive Vercel server caching so link metrics track reliably every time
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

  // Handle click log write requests via POST (executed client-side in legitimate browsers)
  if (req.method === 'POST') {
    if (!firebaseConfig || !firebaseConfig.projectId) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Firebase config missing' }));
      return;
    }

    let bodyData = '';
    req.on('data', chunk => {
      bodyData += chunk.toString();
    });

    req.on('end', async () => {
      try {
        const payload = JSON.parse(bodyData || '{}');
        const { trackingId, linkOwnerId, channel, originalUrl, deviceType, referrer, userAgent } = payload;

        if (!trackingId) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Missing trackingId' }));
          return;
        }

        const projectId = firebaseConfig.projectId;
        const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
        const writeUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/clicks?key=${firebaseConfig.apiKey}`;

        const clickPayload = {
          fields: {
            trackingId: { stringValue: trackingId },
            linkOwnerId: { stringValue: linkOwnerId || '' },
            channel: { stringValue: channel || '연구/기타' },
            originalUrl: { stringValue: originalUrl || '' },
            deviceType: { stringValue: deviceType || 'PC' },
            referrer: { stringValue: referrer || '직접 유입/웹' },
            userAgent: { stringValue: userAgent || '' },
            clickedAt: { timestampValue: new Date().toISOString() }
          }
        };

        await fetch(writeUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(clickPayload)
        });

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true }));
      } catch (err) {
        console.error("Vercel Serverless background click log write error:", err);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Failed to write log' }));
      }
    });
    return;
  }

  // Restrict any methods other than GET as it's the loading/redirection page
  if (req.method !== 'GET') {
    res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Method Not Allowed');
    return;
  }

  // Parse path or query Parameters
  let trackingId = req.query.trackingId;
  if (!trackingId) {
    const parts = req.url.split('?')[0].split('/');
    trackingId = parts[parts.length - 1];
  }

  trackingId = (trackingId || '').trim();

  if (!trackingId || trackingId === 'redirect') {
    res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('잘못된 요청 형식입니다. 올바른 광고 축소 코드를 포함해 주십시오.');
    return;
  }

  if (!firebaseConfig || !firebaseConfig.projectId) {
    // Redundant routing fallback to client-side react app if secrets initialization is pending
    res.writeHead(302, { Location: `/#/r/${trackingId}` });
    res.end();
    return;
  }

  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/links/${trackingId}?key=${firebaseConfig.apiKey}`;

  try {
    const response = await fetch(firestoreUrl);
    if (!response.ok) {
      if (response.status === 404) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('존재하지 않거나 이미 만료된 광고 추적 링크입니다.');
        return;
      }
      throw new Error(`Firestore Rest Gateway Query returned statusCode: ${response.status}`);
    }

    const data = await response.json();
    const fields = data.fields || {};

    const linkData = {
      originalUrl: fields.originalUrl?.stringValue || '',
      userId: fields.userId?.stringValue || '',
      channel: fields.channel?.stringValue || '연구/기타'
    };

    if (!linkData.originalUrl) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('대상 원본 링크 주소가 비어 있는 비정상적인 축소 코드입니다.');
      return;
    }

    let destination = linkData.originalUrl.trim();
    if (!/^https?:\/\//i.test(destination)) {
      destination = 'https://' + destination;
    }

    // 1st Line defense: If it's a known robot/crawler header, redirect them instantly via HTTP 302 directly
    // This bypasses the JS intermediate screen and records absolutely NO click log inside Firebase.
    if (isBotOrPrefetch(req.headers)) {
      console.log(`[Vercel/r] Redirected bot/crawler via direct HTTP 302. User-Agent: ${req.headers['user-agent']}`);
      res.writeHead(302, { Location: destination });
      res.end();
      return;
    }

    // Render an ultra-clean blank HTML with safe client-side logging + immediate redirection
    // Static link checker bots will query this page, see 200 OK, but will never run the JS logic
    // real human browsers run the JS block, register the click in background (via same-origin POST), and proceed
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>Loading</title>
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background-color: #ffffff;
            width: 100%;
            height: 100%;
            overflow: hidden;
          }
        </style>
      </head>
      <body>
        <script>
          (function() {
            var dest = "${destination}";
            var trackingId = "${trackingId}";
            var isBot = navigator.webdriver || /headless|bot|crawler|spider|lighthouse|scrap|crawler/i.test(navigator.userAgent);
            
            if (!isBot) {
              var isMobile = /Mobile|Android|iP(hone|od|ad)/i.test(navigator.userAgent);
              var referrer = document.referrer || '직접 유입/웹';

              // Submit POST request to same URL to trigger click log write asynchronously with keepalive
              fetch(window.location.pathname, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  trackingId: trackingId,
                  linkOwnerId: "${linkData.userId}",
                  channel: "${linkData.channel}",
                  originalUrl: "${linkData.originalUrl}",
                  deviceType: isMobile ? 'Mobile' : 'PC',
                  referrer: referrer,
                  userAgent: navigator.userAgent
                }),
                keepalive: true
              }).catch(function(e) {
                console.warn("Logged silent telemetry click trace fallback warning:", e);
              });
            }

            // Immediately proceed to redirect the browser to the original destination
            try {
              var a = document.createElement('a');
              a.href = dest;
              document.body.appendChild(a);
              a.click();
            } catch(e) {
              window.location.replace(dest);
            }
            setTimeout(function() {
              window.location.replace(dest);
            }, 10);
          })();
        </script>
      </body>
      </html>
    `);
  } catch (err) {
    console.error("Vercel Serverless Function routing crash. Triggering React fallback:", err);
    // Double-redundant failover to SPA router on client browser using the same clean HTML flow
    const fallbackUrl = `/#/r/${trackingId}`;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          html, body {
            margin: 0;
            padding: 0;
            background-color: #ffffff;
          }
        </style>
      </head>
      <body>
        <script>
          window.location.replace("${fallbackUrl}");
        </script>
      </body>
      </html>
    `);
  }
}
