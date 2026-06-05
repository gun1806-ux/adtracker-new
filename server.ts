import express from 'express';
import path from 'path';
import fs from 'fs';

function isBotOrPrefetch(headers: any): boolean {
  const userAgent = (headers['user-agent'] || '') as string;
  const purpose = (headers['purpose'] || headers['x-purpose'] || headers['sec-purpose'] || headers['x-moz'] || '') as string;
  
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

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Read Firebase configuration once on startup
  let firebaseConfig: any = null;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      console.log('Firebase configuration loaded on server-side successfully for REST API direct routing.');
    } else {
      console.warn('Firebase configuration file not found at:', configPath);
    }
  } catch (err) {
    console.error('Failed to load Firebase config on server-side startup:', err);
  }

  // 1. Direct Server-Side Click Logging Endpoint (Called asynchronously from browser JS)
  app.post('/r/:trackingId', express.json(), async (req, res) => {
    const trackingId = req.params.trackingId.trim();
    if (!trackingId) {
      return res.status(400).json({ error: 'Invalid tracking ID' });
    }

    if (!firebaseConfig || !firebaseConfig.projectId) {
      return res.status(500).json({ error: 'Firebase config missing' });
    }

    try {
      const { linkOwnerId, channel, originalUrl, deviceType, referrer, userAgent } = req.body;
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

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error("Local/Express Serverless background click log write error:", err);
      return res.status(500).json({ error: 'Failed to write click log' });
    }
  });

  // 2. Direct Server-Side Redirector Endpoint
  // Bypasses React frontend load sequences entirely for instant redirects and secure logging.
  // Switched to lightweight REST API to prevent browser-model gRPC/WS handshake delays (0.1s instead of 3s)
  app.get('/r/:trackingId', async (req, res) => {
    const trackingId = req.params.trackingId.trim();
    if (!trackingId) {
      return res.status(400).send('코드가 유효하지 않습니다.');
    }

    if (!firebaseConfig || !firebaseConfig.projectId) {
      // Graceful fallback to client-side router if config is missing
      return res.redirect(302, `/#/r/${trackingId}`);
    }

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/links/${trackingId}?key=${firebaseConfig.apiKey}`;

    try {
      const response = await fetch(firestoreUrl);
      if (!response.ok) {
        if (response.status === 404) {
          return res.status(404).send('존재하지 않거나 이미 만료된 광고 추적 링크입니다.');
        }
        throw new Error(`Firestore REST API returned status ${response.status}`);
      }

      const data: any = await response.json();
      const fields = data.fields || {};

      const linkData = {
        originalUrl: fields.originalUrl?.stringValue || '',
        userId: fields.userId?.stringValue || '',
        channel: fields.channel?.stringValue || '연구/기타'
      };

      if (!linkData.originalUrl) {
        return res.status(404).send('원본 링크 정보가 비어 있는 비정상적인 추적 링크입니다.');
      }

      let destination = linkData.originalUrl.trim();
      if (!/^https?:\/\//i.test(destination)) {
        destination = 'https://' + destination;
      }

      // 1st Line defense: If it's a known robot/crawler header, redirect them instantly via HTTP 302 directly
      // This bypasses the JS intermediate screen and records absolutely NO click log inside Firebase.
      if (isBotOrPrefetch(req.headers)) {
        console.log(`[Express/r] Redirected bot/crawler via direct HTTP 302. User-Agent: ${req.headers['user-agent']}`);
        return res.redirect(302, destination);
      }

      // Render an ultra-clean blank HTML with safe client-side logging + immediate redirection
      // Static link checker bots will query this page, see 200 OK, but will never run the JS logic
      // real human browsers run the JS block, register the click in background (via same-origin POST), and proceed
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
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
    } catch (redirectErr) {
      console.error("Direct server REST redirect failed for tracing session:", redirectErr);
      // Dual-redundant fallback to client-side router if anything fails on server-side database fetch
      const fallbackUrl = `/#/r/${trackingId}`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
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
  });

  // 2. Serve static resources & React SPA routes
  // Strict check on production to prevent hasDist dev overlap
  const distPath = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);

    // Serve index.html transformed by Vite in development mode
    app.get('*', async (req, res, next) => {
      try {
        const url = req.originalUrl;
        const htmlPath = path.resolve(process.cwd(), 'index.html');
        let html = fs.readFileSync(htmlPath, 'utf-8');
        html = await vite.transformIndexHtml(url, html);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(html);
      } catch (err) {
        next(err);
      }
    });
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server executing live on http://localhost:${PORT}`);
  });
}

startServer();
