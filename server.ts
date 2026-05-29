import express from 'express';
import path from 'path';
import fs from 'fs';

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

  // 1. Direct Server-Side Redirector Endpoint
  // Bypasses React frontend load sequences entirely for instant redirects and secure logging.
  // Switched to lightweight REST API to prevent browser-model gRPC/WS handshake delays (0.1s instead of 3s)
  app.get('/r/:trackingId', async (req, res) => {
    const trackingId = req.params.trackingId.trim();
    if (!trackingId) {
      return res.status(400).send('코드가 유효하지 않습니다.');
    }

    if (!firebaseConfig || !firebaseConfig.projectId) {
      // Graceful fallback to client-side router if config is missing
      const fallbackUrl = `/#/r/${trackingId}`;
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="referrer" content="no-referrer">
          <meta http-equiv="refresh" content="0; url=${fallbackUrl}">
        </head>
        <body>
          <script>
            window.location.replace("${fallbackUrl}");
          </script>
        </body>
        </html>
      `);
    }

    const projectId = firebaseConfig.projectId;
    const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
    const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/links/${trackingId}`;

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

      // Analyze Client agent metadata
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iP(hone|od|ad)/i.test(userAgent);
      const deviceType = isMobile ? 'Mobile' : 'PC';
      const referrer = req.headers['referer'] || '직접 유입/웹';

      // Log click metrics using Firestore REST API (Async / Fire-and-forget style)
      const writeUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/clicks`;
      const clickPayload = {
        fields: {
          trackingId: { stringValue: trackingId },
          linkOwnerId: { stringValue: linkData.userId },
          channel: { stringValue: linkData.channel },
          originalUrl: { stringValue: linkData.originalUrl },
          deviceType: { stringValue: deviceType },
          referrer: { stringValue: referrer },
          userAgent: { stringValue: userAgent },
          clickedAt: { timestampValue: new Date().toISOString() }
        }
      };

      fetch(writeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(clickPayload)
      }).catch((traceErr) => {
        console.warn("Silent server REST telemetry logs error:", traceErr);
      });

      // Execute anti-captcha HTML Client-Side instant redirect with no-referrer
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.status(200).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta http-equiv="X-UA-Compatible" content="IE=edge">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <meta name="referrer" content="no-referrer">
          <title>연결 중...</title>
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              height: 100vh;
              margin: 0;
              background-color: #f9fafb;
              color: #4b5563;
            }
            .loader-container {
              text-align: center;
            }
            .spinner {
              width: 40px;
              height: 40px;
              border: 3px solid #e5e7eb;
              border-top: 3px solid #10b981;
              border-radius: 50%;
              animation: spin 0.8s linear infinite;
              margin: 0 auto 16px;
            }
            @keyframes spin {
              0% { transform: rotate(0deg); }
              100% { transform: rotate(360deg); }
            }
          </style>
          <meta http-equiv="refresh" content="0; url=${destination}">
        </head>
        <body>
          <div class="loader-container">
            <div class="spinner"></div>
            <div>안전하게 원본 페이지로 이동하고 있습니다. 잠시만 기다려 주세요...</div>
          </div>
          <script>
            setTimeout(function() {
              window.location.replace("${destination}");
            }, 50);
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
          <meta name="referrer" content="no-referrer">
          <meta http-equiv="refresh" content="0; url=${fallbackUrl}">
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
