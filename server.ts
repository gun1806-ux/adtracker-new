import express from 'express';
import path from 'path';
import fs from 'fs';
import { initializeApp, getApps, getApp } from 'firebase/app';
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from 'firebase/firestore';

async function startServer() {
  const app = express();
  const PORT = 3000;

  let db: any = null;

  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));

      const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
      db = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);
      console.log('Firebase initialized successfully on server-side natively as ES Module.');
    } else {
      console.warn('Firebase configuration file not found at:', configPath);
    }
  } catch (err) {
    console.error('Failed to initialize Firebase on server-side:', err);
  }

  // 1. Direct Server-Side Redirector Endpoint
  // Bypasses React frontend load sequences entirely for instant redirects and secure logging.
  app.get('/r/:trackingId', async (req, res) => {
    const trackingId = req.params.trackingId.trim();
    if (!trackingId) {
      return res.status(400).send('코드가 유효하지 않습니다.');
    }

    if (!db) {
      // Graceful fallback to client-side router if server db initialization is pending
      return res.redirect(302, `/#/r/${trackingId}`);
    }

    try {
      const linkDocRef = doc(db, 'links', trackingId);
      const linkDocSnap = await getDoc(linkDocRef);

      if (!linkDocSnap.exists()) {
        return res.status(404).send('존재하지 않거나 이미 만료된 광고 추적 링크입니다.');
      }

      const linkData = linkDocSnap.data();
      let destination = linkData.originalUrl.trim();
      if (!/^https?:\/\//i.test(destination)) {
        destination = 'https://' + destination;
      }

      // Analyze Client agent metadata
      const userAgent = req.headers['user-agent'] || '';
      const isMobile = /Mobile|Android|iP(hone|od|ad)/i.test(userAgent);
      const deviceType = isMobile ? 'Mobile' : 'PC';
      const referrer = req.headers['referer'] || '직접 유입/웹';

      // Safe fire-and-forget back-end tracing click log registration
      addDoc(collection(db, 'clicks'), {
        trackingId,
        linkOwnerId: linkData.userId || '',
        channel: linkData.channel || '연구/기타',
        originalUrl: linkData.originalUrl,
        deviceType,
        referrer,
        userAgent,
        clickedAt: serverTimestamp()
      }).catch((traceErr) => {
        console.warn("Silent server telemetry logs error:", traceErr);
      });

      // Execute instant 302 redirection (Standard HTTP Redirect)
      res.redirect(302, destination);
    } catch (redirectErr) {
      console.error("Direct server redirect failed for tracing session:", redirectErr);
      // Dual-redundant fallback to client-side router if anything fails on server-side database fetch
      res.redirect(302, `/#/r/${trackingId}`);
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
