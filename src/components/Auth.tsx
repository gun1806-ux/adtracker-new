import { useState, FormEvent } from 'react';
import { auth, handleFirestoreError, OperationType } from '../firebase';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { Mail, Lock, Loader2, Link2, CheckCircle2, AlertCircle } from 'lucide-react';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    // --- Admin custom bypass logic ---
    if (email.trim() === 'ad789' && password === 'pro159') {
      localStorage.setItem('adtracker_admin_session', 'true');
      setSuccessMsg('마스터 관리자 로그인 성공! 관리자 콘솔로 이동합니다...');
      setTimeout(() => {
        window.location.reload();
      }, 800);
      setLoading(false);
      return;
    }

    try {
      if (isLogin) {
        await signInWithEmailAndPassword(auth, email, password);
        setSuccessMsg('로그인에 성공했습니다.');
      } else {
        await createUserWithEmailAndPassword(auth, email, password);
        setSuccessMsg('회원가입이 완료되었습니다! 자동으로 로그인합니다.');
      }
    } catch (err: any) {
      console.error(err);
      let korMessage = '오류가 발생했습니다. 다시 시도해 주세요.';
      if (err.code === 'auth/operation-not-allowed') {
        korMessage = "이메일/비밀번호 로그인이 Firebase 프로젝트에서 아직 활성화되지 않았습니다. 번거로운 콘솔 설정 없이 즉시 로그인할 수 있도록 아래의 'Google 계정으로 계속하기' 버튼을 추가했으니 이를 대신 사용해보세요!";
      } else if (err.code === 'auth/invalid-credential' || err.code === 'auth/wrong-password') {
        korMessage = '이메일 또는 비밀번호가 잘못되었습니다.';
      } else if (err.code === 'auth/email-already-in-use') {
        korMessage = '이미 가입된 이메일 주소입니다.';
      } else if (err.code === 'auth/weak-password') {
        korMessage = '비밀번호는 6자리 이상이어야 합니다.';
      } else if (err.code === 'auth/invalid-email') {
        korMessage = '유효하지 않은 이메일 형식입니다.';
      } else if (err.message) {
        korMessage = err.message;
      }
      setErrorMsg(korMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
      setSuccessMsg('Google 로그인에 성공했습니다.');
    } catch (err: any) {
      console.error(err);
      let korMessage = 'Google 로그인 중 오류가 발생했습니다.';
      if (err.message) {
        korMessage = err.message;
      }
      setErrorMsg(korMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0A0A0B] px-4 py-12 relative overflow-hidden font-sans">
      {/* Background radial highlight */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-blue-900/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-emerald-900/10 rounded-full blur-3xl pointer-events-none" />

      <div className="bg-[#161618] p-8 rounded-2xl shadow-2xl w-full max-w-md border border-slate-800 relative z-10 transition-all duration-300">
        
        {/* Logo and Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20 mb-4">
            <Link2 className="w-6 h-6 rotate-45" />
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">AdTracker <span className="text-blue-500">PRO</span></h1>
          <p className="text-slate-400 mt-1 text-sm font-medium">컴맹도 3초 만에 발급하는 광고 유입 분석기</p>
        </div>

        {/* Messaging area */}
        {errorMsg && (
          <div className="mb-5 p-3 rounded-xl bg-red-950/30 text-red-400 text-xs font-semibold border border-red-900/40 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 block shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="mb-5 p-3 rounded-xl bg-emerald-950/30 text-emerald-400 text-xs font-semibold border border-emerald-900/40 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Input Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">이메일 주소 / 관리자 ID</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                <Mail className="w-4 h-4" />
              </span>
              <input 
                type="text" 
                required 
                placeholder="you@example.com 또는 관리자ID"
                className="w-full pl-10 pr-4 py-3 bg-[#0A0A0B] border border-slate-700 rounded-xl text-sm font-medium text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all font-mono" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5">비밀번호 (6자리 이상)</label>
            <div className="relative">
              <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                <Lock className="w-4 h-4" />
              </span>
              <input 
                type="password" 
                required 
                placeholder="••••••••"
                minLength={6} 
                className="w-full pl-10 pr-4 py-3 bg-[#0A0A0B] border border-slate-700 rounded-xl text-sm font-medium text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
            </div>
          </div>

          <button 
            type="submit" 
            disabled={loading} 
            className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3.5 px-4 rounded-xl text-sm transition-all shadow-md shadow-blue-600/10 hover:shadow-lg hover:shadow-blue-600/20 flex justify-center items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed mt-6"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin-fast" />
                <span>처리 중...</span>
              </>
            ) : (
              <span>{isLogin ? '로그인하기' : '무료 회원가입'}</span>
            )}
          </button>
        </form>

        {/* OR Divider */}
        <div className="relative my-6 flex items-center justify-center">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-800" />
          </div>
          <span className="relative bg-[#161618] px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider">
            또는
          </span>
        </div>

        {/* Google Sign-In Button */}
        <button
          type="button"
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-[#111113] hover:bg-[#1a1a1c] border border-slate-700 hover:border-slate-600 text-slate-200 font-bold py-3.5 px-4 rounded-xl text-sm transition-all flex justify-center items-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed shadow-md"
        >
          <svg className="w-4.5 h-4.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
          </svg>
          <span>Google 계정으로 계속하기</span>
        </button>



        {/* Toggle option */}
        <div className="mt-8 pt-6 border-t border-slate-800 text-center">
          <button 
            type="button"
            onClick={() => {
              setIsLogin(!isLogin);
              setErrorMsg('');
              setSuccessMsg('');
            }} 
            className="text-blue-400 text-xs font-bold hover:text-blue-300 hover:underline transition-all cursor-pointer bg-transparent border-none"
          >
            {isLogin ? '계정이 없으신가요? 무료 회원가입' : '이미 계정이 있나요? 로그인하기'}
          </button>
        </div>
      </div>
    </div>
  );
}
