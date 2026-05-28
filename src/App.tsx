import { useState, useEffect } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import Auth from './components/Auth';
import Dashboard from './components/Dashboard';
import AdminDashboard from './components/AdminDashboard';
import RedirectHandler from './components/RedirectHandler';
import { Loader2, ShieldAlert, LogOut, CheckCircle2, X } from 'lucide-react';

export default function App() {
  const [isAdmin, setIsAdmin] = useState(() => localStorage.getItem('adtracker_admin_session') === 'true');
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [registrationStatus, setRegistrationStatus] = useState<string | null>(null);
  const [statusLoading, setStatusLoading] = useState(false);
  const [currentHash, setCurrentHash] = useState(window.location.hash);
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  // 1. Subscribe to Authentication state change triggers
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 1.2 Subscribe and listen to the real-time registration status of the logged-in user
  useEffect(() => {
    if (isAdmin) {
      setRegistrationStatus(null);
      return;
    }
    if (!user) {
      setRegistrationStatus(null);
      return;
    }

    setStatusLoading(true);
    const docRef = doc(db, 'user_registrations', user.uid);
    const unsubscribeStatus = onSnapshot(docRef, async (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.data();
        setRegistrationStatus(data.status || 'pending');
        setStatusLoading(false);
      } else {
        // Create the registration record on the fly with pending status
        try {
          await setDoc(docRef, {
            uid: user.uid,
            email: user.email || 'Google User',
            status: 'pending',
            createdAt: new Date().toISOString()
          });
          setRegistrationStatus('pending');
        } catch (err) {
          console.error("Error setting initial user status:", err);
        } finally {
          setStatusLoading(false);
        }
      }
    }, (error) => {
      console.error("Error subscribing to user status:", error);
      setStatusLoading(false);
    });

    return () => unsubscribeStatus();
  }, [user, isAdmin]);

  const handleUserLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Logout error:", err);
    }
  };

  // 1.5 Diagnostic Timeout for slower networks or Firebase setup delays
  useEffect(() => {
    if (authLoading) {
      const timer = setTimeout(() => {
        setShowDiagnostic(true);
      }, 5000);
      return () => clearTimeout(timer);
    } else {
      setShowDiagnostic(false);
    }
  }, [authLoading]);

  // 2. Subscribe to local window URL Hashing actions (React-free dynamic SPA router)
  useEffect(() => {
    const handleHashChange = () => {
      setCurrentHash(window.location.hash);
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  // 3. Dynamic routing branches for tracking links
  // Supports hash paths like #/r/{trackingId} and clean paths like /r/{trackingId}
  // This must be checked BEFORE authLoading or user checks so visitors are never prompted to login!
  const getTrackingId = (): string | null => {
    const hashPart = currentHash.split('?')[0];
    if (hashPart.startsWith('#/r/')) {
      return hashPart.replace('#/r/', '').replace(/\/+$/, '').trim();
    }
    if (hashPart.startsWith('#r/')) {
      return hashPart.replace('#r/', '').replace(/\/+$/, '').trim();
    }
    const pathPart = window.location.pathname.split('?')[0];
    if (pathPart.startsWith('/r/')) {
      return pathPart.replace('/r/', '').replace(/\/+$/, '').trim();
    }
    return null;
  };

  // 4. Render Admin Console if logged in as Admin
  if (isAdmin) {
    return (
      <AdminDashboard 
        onLogout={() => {
          localStorage.removeItem('adtracker_admin_session');
          setIsAdmin(false);
          window.location.reload();
        }} 
      />
    );
  }

  const activeTrackingId = getTrackingId();
  if (activeTrackingId) {
    return <RedirectHandler trackingId={activeTrackingId} />;
  }

  // 5. Render loading layout if auth status is unknown
  if (authLoading || statusLoading) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center text-white px-4 select-none relative overflow-hidden">
        {/* Ambient background glows */}
        <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-red-950/10 rounded-full blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center gap-6 max-w-md w-full relative z-10">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-xs font-bold text-slate-500 tracking-wider uppercase animate-pulse">
              AdTracker 세션을 인증하는 중...
            </p>
          </div>

          {showDiagnostic && (
            <div className="w-full bg-[#161618] border border-slate-800 p-5 rounded-2xl shadow-2xl text-left animate-in fade-in slide-in-from-top-4 duration-300">
              <h3 className="text-xs font-extrabold text-amber-400 flex items-center gap-2 mb-3">
                <span className="w-2 h-2 rounded-full bg-amber-500 block animate-ping" />
                인증이 지연되고 있으신가요? (자가 진단 가이드)
              </h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-4">
                현재 접속 도메인인 <code className="bg-slate-950 px-1.5 py-0.5 rounded text-blue-400 font-mono text-[10px] select-all">{window.location.host}</code>에서 Firebase 세션 진입이 지연되고 있습니다. 다음 단계들을 점검하여 손쉽게 문제를 해결해 보세요!
              </p>
              
              <ul className="space-y-3.5">
                <li className="text-xs text-slate-300">
                  <strong className="block text-slate-200 mb-0.5">1. Firebase Console "승인된 도메인" 설정</strong>
                  구글 로그인 또는 정상적인 Firebase SDK 교신을 위해, Firebase 콘솔의 <strong className="text-amber-300">Authentication ➔ 설정 ➔ 승인된 도메인</strong> 탭에 아래 도메인을 복사해서 반드시 등록해 주셔야 원활한 로그인이 작동합니다.
                  <div className="mt-1.5 flex flex-col gap-1 bg-slate-950 p-2 rounded text-[10px] font-mono text-slate-400">
                    <span className="select-all">ais-pre-k4y6qik6rttsekcahzlt76-837753182149.asia-east1.run.app</span>
                    <span className="select-all">ais-dev-k4y6qik6rttsekcahzlt76-837753182149.asia-east1.run.app</span>
                  </div>
                </li>
                <li className="text-xs text-slate-300">
                  <strong className="block text-slate-200 mb-0.5">2. 쿠키 허용 및 캐시 비우기</strong>
                  시크릿 모드나 타사 쿠키가 제한된 특수 브라우저(예: 일부 인앱 브라우저, Safari 강력 보안 모드) 등은 Firebase 초기 세션 진입을 제한할 수 있습니다. 쿠키 차단을 해제하시거나, 크롬/일반 탭에서 새로 들어와 주십시오.
                </li>
              </ul>

              <button
                onClick={() => window.location.reload()}
                className="mt-5 w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs rounded-xl transition-all shadow-md shadow-blue-600/10 cursor-pointer text-center block"
              >
                페이지 새로고침 (Reload)
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // 6. Access restriction check for unapproved accounts
  if (user) {
    if (registrationStatus === 'pending') {
      return (
        <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center text-slate-200 px-4 relative overflow-hidden font-sans select-none">
          <div className="absolute top-1/4 left-1/4 w-80 h-80 bg-blue-900/5 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-amber-950/5 rounded-full blur-3xl pointer-events-none" />

          <div className="bg-[#161618] border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full relative z-10 text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-amber-650/10 border border-amber-900/30 rounded-2xl flex items-center justify-center text-amber-500 mb-5 animate-pulse">
              <ShieldAlert className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-extrabold text-white tracking-tight mb-2">관리자의 승인을 기다립니다</h2>
            <p className="text-slate-400 text-xs font-semibold font-mono mb-4 px-3 py-1 bg-[#0A0A0B] border border-slate-850 rounded text-center select-all">
              이메일: {user.email}
            </p>

            <p className="text-slate-400 text-xs sm:text-[13px] leading-relaxed mb-6 px-1">
              회원가입 요청이 프라이빗 마스터 관리자에게 실시간 전달되었습니다! 관리자가 확인 후 즉시 광고 유입 추적 기능을 사용하실 수 있도록 가입을 활성화할 예정입니다.
            </p>

            <div className="w-full flex flex-col gap-2.5">
              <div className="flex items-center justify-center gap-2 text-xs text-slate-400 font-bold bg-[#0A0A0B]/50 py-3 rounded-lg border border-slate-850">
                <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                <span>계정 활성화 대기 중...</span>
              </div>

              <button
                onClick={handleUserLogout}
                className="w-full py-3 bg-[#111113] hover:bg-[#1a1a1c] border border-slate-700 hover:border-slate-650 font-bold text-xs text-slate-300 rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5 text-red-400" />
                <span>다른 계정으로 로그인 (로그아웃)</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (registrationStatus === 'rejected') {
      return (
        <div className="min-h-screen bg-[#0A0A0B] flex flex-col items-center justify-center text-slate-200 px-4 relative overflow-hidden font-sans select-none">
          <div className="bg-[#161618] border border-slate-800 p-8 rounded-2xl shadow-2xl max-w-md w-full text-center flex flex-col items-center animate-in fade-in zoom-in-95 duration-200">
            <div className="w-14 h-14 bg-red-950/25 border border-red-900/50 rounded-2xl flex items-center justify-center text-red-500 mb-5">
              <X className="w-7 h-7" />
            </div>

            <h2 className="text-xl font-extrabold text-white tracking-tight mb-2">가입 승인이 거절되었습니다</h2>
            <p className="text-slate-400 text-xs font-semibold font-mono mb-4 px-3 py-1 bg-[#0A0A0B] border border-slate-850 rounded">
              계정: {user.email}
            </p>

            <p className="text-slate-400 text-xs sm:text-[13px] leading-relaxed mb-6 px-1">
              해당 이메일 계정의 이용 권한 승인이 거절되었습니다. 의뢰주의 마스터 관리자에게 직접 문의하여 승인을 재요청하시길 바랍니다.
            </p>

            <button
              onClick={handleUserLogout}
              className="w-full py-3 bg-red-950/20 hover:bg-red-900/20 border border-red-900/50 text-red-400 font-bold text-xs rounded-xl transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃 후 돌아가기</span>
            </button>
          </div>
        </div>
      );
    }
  }

  // 7. Request authentication if user is null
  if (!user) {
    return <Auth />;
  }

  return <Dashboard user={user} />;
}
