import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  // Disable aggressive Vercel server caching so link metrics track reliably every time
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');

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

  // Load Firestore Secrets natively from Workspace Environment Config
  let firebaseConfig = null;
  try {
    const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    }
  } catch (err) {
    console.error('Failed to parse Firebase configuration on Vercel instance startup:', err);
  }

  if (!firebaseConfig || !firebaseConfig.projectId) {
    // Redundant routing fallback to client-side react app if secrets initialization is pending
    res.writeHead(302, { Location: `/#/r/${trackingId}` });
    res.end();
    return;
  }

  const projectId = firebaseConfig.projectId;
  const databaseId = firebaseConfig.firestoreDatabaseId || '(default)';
  const firestoreUrl = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/${databaseId}/documents/links/${trackingId}`;

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

    // Client context environment analytics metadata parsing on server-side
    const userAgent = req.headers['user-agent'] || '';
    const isMobile = /Mobile|Android|iP(hone|od|ad)/i.test(userAgent);
    const deviceType = isMobile ? 'Mobile' : 'PC';
    const referrer = req.headers['referer'] || '직접 유입/웹';

    // Register click logs using high-speed fire-and-forget raw API calls
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
      console.warn("Silent server REST function telemetry logging warning:", traceErr);
    });

    // Execute instant HTTP Redirect!
    res.writeHead(302, { Location: destination });
    res.end();
  } catch (err) {
    console.error("Vercel Serverless Function routing crash. Triggering React fallback:", err);
    // Double-redundant failover to SPA router on client browser
    res.writeHead(302, { Location: `/#/r/${trackingId}` });
    res.end();
  }
}
