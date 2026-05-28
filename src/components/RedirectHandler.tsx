import { useEffect, useState } from 'react';
import { db } from '../firebase';
import { doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { AlertCircle, Loader2 } from 'lucide-react';

interface RedirectHandlerProps {
  trackingId: string;
}

export default function RedirectHandler({ trackingId }: RedirectHandlerProps) {
  const [status, setStatus] = useState('광고 대상 링크를 검증하는 중입니다...');
  const [errorOccurred, setErrorOccurred] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const processRedirect = async () => {
      try {
        const cleanId = trackingId.split('?')[0].replace(/\/+$/, '').trim();
        if (!cleanId) {
          if (active) {
            setStatus('유효하지 않은 축소주소 코드 형식입니다.');
            setErrorOccurred(true);
            setDebugInfo('Tracking ID is empty after clean parameters.');
          }
          return;
        }

        // 1. Fetch from Firestore with direct read and query fallback
        let linkData: any = null;
        let fetchErrorDetail: string | null = null;

        try {
          const linkDocRef = doc(db, 'links', cleanId);
          const linkDocSnap = await getDoc(linkDocRef);
          if (linkDocSnap.exists()) {
            linkData = linkDocSnap.data();
          } else {
            // Backward/custom query compatibility fallback
            const linksQuery = query(
              collection(db, 'links'),
              where('trackingId', '==', cleanId)
            );
            const querySnapshot = await getDocs(linksQuery);
            if (!querySnapshot.empty) {
              linkData = querySnapshot.docs[0].data();
            }
          }
        } catch (dbErr: any) {
          fetchErrorDetail = dbErr?.message || String(dbErr);
          console.error("Firestore database retrieve warning:", dbErr);
        }

        if (!active) {
          // If unmounted but redirect was successful, allow execution to proceed or warn
          console.log("Component unmounted but link fetch finalized for ID:", cleanId);
        }

        if (!linkData) {
          if (active) {
            setStatus('유효하지 않거나 이미 삭제된 광고 배포 주소입니다.');
            setErrorOccurred(true);
            setDebugInfo(fetchErrorDetail 
              ? `DB 에러 발생: ${fetchErrorDetail}` 
              : `ID [${cleanId}]를 데이터베이스에서 찾을 수 없습니다. (링크가 아직 미생성 상태이거나 삭제되었음)`
            );
          }
          return;
        }

        if (active) {
          setStatus('원본 대상 페이지로 안전하게 리다이렉트하는 중...');
        }

        // 2. Client environment analytics metadata parsing
        const userAgent = navigator.userAgent;
        const isMobile = /Mobile|Android|iP(hone|od|ad)/i.test(userAgent);

        // 3. Register click metrics into 'clicks' logs in background (Fire-and-forget safely)
        addDoc(collection(db, 'clicks'), {
          trackingId: cleanId,
          linkOwnerId: linkData.userId || '', 
          channel: linkData.channel || '연구/기타',
          originalUrl: linkData.originalUrl,
          deviceType: isMobile ? 'Mobile' : 'PC',
          referrer: document.referrer || '직접 유입/웹',
          userAgent: userAgent,
          clickedAt: serverTimestamp()
        }).catch((clickErr) => {
          console.warn("Logged silent telemetry click trace fallback:", clickErr);
        });

        // 4. Trigger target redirect
        let destination = linkData.originalUrl.trim();
        if (!/^https?:\/\//i.test(destination)) {
          destination = 'https://' + destination;
        }

        // We use various overlapping fallback mechanisms to secure redirection in aggressive security sandboxes.
        // First try: hidden dynamic un-referred anchor trigger to strip original sandboxed domain referrers.
        const dynamicAnchor = document.createElement('a');
        dynamicAnchor.href = destination;
        dynamicAnchor.rel = 'noreferrer noopener';
        document.body.appendChild(dynamicAnchor);
        dynamicAnchor.click();

        // Second try: Immediate javascript location fallback loops inside browsers rejecting programmatic tag clicks.
        setTimeout(() => {
          window.location.replace(destination);
        }, 12);

        setTimeout(() => {
          window.location.href = destination;
        }, 80);

      } catch (error: any) {
        console.error('Redirect overall runtime error:', error);
        if (active) {
          setStatus('서버 통신 초기화 지연 및 승인 오류가 발생했습니다.');
          setErrorOccurred(true);
          setDebugInfo(error?.message || String(error));
        }
      }
    };

    processRedirect();

    return () => {
      active = false;
    };
  }, [trackingId]);

  // If redirect is fast and active, keep a minimal dark-loading state block to prevent branding exposure
  if (!errorOccurred) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center text-white select-none">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
          <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-none animate-pulse">
            AdTracker 보안 경유지로 이동 중...
          </p>
        </div>
      </div>
    );
  }

  // Stylish fallback error page if validation or initialization fail
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#0A0A0B] text-white font-sans p-6 text-center select-none relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-red-950/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-orange-950/20 rounded-full blur-3xl pointer-events-none" />

      <div className="relative z-10 max-w-sm w-full space-y-6">
        <div className="mx-auto w-14 h-14 bg-red-950/50 border border-red-900/45 text-red-500 rounded-2xl flex items-center justify-center">
          <AlertCircle className="w-7 h-7" />
        </div>

        <div className="space-y-3">
          <h2 className="text-base font-extrabold tracking-tight text-red-400">
            {status}
          </h2>
          <p className="text-xs text-slate-500 font-semibold select-none leading-relaxed">
            광고 링크 검증 중 오류가 검출되었습니다. 배포 주소를 소유한 분께 문의하십시오.
          </p>

          {debugInfo && (
            <div className="mt-4 p-3.5 bg-slate-950 border border-slate-900 rounded-xl text-left">
              <span className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1 select-none">시스템 진단 로그 (Diagnostic Log):</span>
              <p className="text-[10px] font-mono text-slate-400 leading-normal break-all select-all">
                {debugInfo}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

