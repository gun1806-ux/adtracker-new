import { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { nanoid } from 'nanoid';
import { 
  Users, 
  Check, 
  X, 
  Trash2, 
  Plus, 
  LogOut, 
  Shield, 
  Loader2, 
  Edit2, 
  Save, 
  AlertCircle, 
  PlusCircle,
  Clock,
  UserCheck
} from 'lucide-react';

interface UserRegistration {
  uid: string;
  email: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

interface AdminDashboardProps {
  onLogout: () => void;
}

export default function AdminDashboard({ onLogout }: AdminDashboardProps) {
  const [registrations, setRegistrations] = useState<UserRegistration[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Custom states for manual user creation
  const [newEmail, setNewEmail] = useState('');
  const [newStatus, setNewStatus] = useState<'pending' | 'approved'>('approved');
  const [actionLoading, setActionLoading] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState('');

  // Editing state
  const [editingUid, setEditingUid] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState('');

  // 1. Subscribe to real-time updates for user registrations
  useEffect(() => {
    const colRef = collection(db, 'user_registrations');
    const unsubscribe = onSnapshot(colRef, (snapshot) => {
      const list: UserRegistration[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          uid: doc.id,
          email: data.email || '',
          status: data.status || 'pending',
          createdAt: data.createdAt || ''
        });
      });
      // Sort by creation date
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setRegistrations(list);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching registrations in admin:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Action: Approve User
  const handleApprove = async (uid: string) => {
    try {
      const docRef = doc(db, 'user_registrations', uid);
      await updateDoc(docRef, { status: 'approved' });
      showFeedback('회원 가입을 승인했습니다.');
    } catch (err) {
      console.error(err);
      showFeedback('승인 처리 중 오류가 발생했습니다.');
    }
  };

  // Action: Reject User
  const handleReject = async (uid: string) => {
    try {
      const docRef = doc(db, 'user_registrations', uid);
      await updateDoc(docRef, { status: 'rejected' });
      showFeedback('회원 가입을 거절 처리를 완료했습니다.');
    } catch (err) {
      console.error(err);
      showFeedback('거절 처리 중 오류가 발생했습니다.');
    }
  };

  // Action: Add user manually
  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailStr = newEmail.trim();
    if (!emailStr) return;

    setActionLoading(true);
    setFeedbackMsg('');

    try {
      // Create a collision-less unique ID for manually registered users
      const randomUid = `approved-user-${nanoid(8)}`;
      const docRef = doc(db, 'user_registrations', randomUid);
      
      await setDoc(docRef, {
        uid: randomUid,
        email: emailStr,
        status: newStatus,
        createdAt: new Date().toISOString()
      });

      setNewEmail('');
      showFeedback(`신규 이메일(${emailStr})을 성공적으로 목록에 추가했습니다.`);
    } catch (err) {
      console.error(err);
      showFeedback('회원 추가에 실패했습니다.');
    } finally {
      setActionLoading(false);
    }
  };

  // Action: Delete user registration
  const handleDeleteUser = async (uid: string) => {
    if (!window.confirm('정말로 이 회원을 데이터베이스에서 삭제하시겠습니까?')) {
      return;
    }

    try {
      const docRef = doc(db, 'user_registrations', uid);
      await deleteDoc(docRef);
      showFeedback('회원을 성공적으로 삭제했습니다.');
    } catch (err) {
      console.error(err);
      showFeedback('회원 삭제 중 오류가 발생했습니다.');
    }
  };

  // Action: Inline edit user email
  const handleSaveEmail = async (uid: string) => {
    const trimmedEmail = editingEmail.trim();
    if (!trimmedEmail) {
      setEditingUid(null);
      return;
    }

    try {
      const docRef = doc(db, 'user_registrations', uid);
      await updateDoc(docRef, { email: trimmedEmail });
      setEditingUid(null);
      showFeedback('이메일 주소를 수정했습니다.');
    } catch (err) {
      console.error(err);
      showFeedback('이메일 수정 중 오류가 발생했습니다.');
    }
  };

  const showFeedback = (msg: string) => {
    setFeedbackMsg(msg);
    setTimeout(() => {
      setFeedbackMsg('');
    }, 4000);
  };

  const pendingUsers = registrations.filter(r => r.status === 'pending');
  const approvedUsers = registrations.filter(r => r.status === 'approved');
  const rejectedUsers = registrations.filter(r => r.status === 'rejected');

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 font-sans pb-20 relative overflow-hidden">
      {/* Visual top and bottom backgrounds matching branding */}
      <div className="absolute top-0 left-1/3 w-96 h-96 bg-blue-900/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-violet-950/5 rounded-full blur-3xl pointer-events-none" />

      {/* Header element */}
      <header className="border-b border-slate-800 bg-[#161618]/60 backdrop-blur-md sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-amber-500/10">
              <Shield className="w-5.3 h-5.3" />
            </div>
            <div>
              <h1 className="text-base font-extrabold text-white tracking-tight flex items-center gap-1.5">
                AdTracker PRO <span className="text-amber-500 text-xs font-black tracking-widest px-1.5 py-0.5 rounded bg-amber-950/40 border border-amber-900/60 uppercase">System Admin</span>
              </h1>
              <p className="text-[11px] text-slate-400 font-medium">실시간 가입 회원 승인 & 고객 계정 마스터 관리 시스템</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col text-right">
              <span className="text-xs font-bold text-slate-300">관리자 계정: <span className="text-blue-400 font-mono">ad789</span></span>
              <span className="text-[10px] text-slate-500 font-semibold font-mono">Session: Active</span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 bg-red-950/30 hover:bg-red-900/30 text-red-400 border border-red-900/50 hover:border-red-800 py-2 px-3.5 rounded-xl text-xs font-extrabold transition-all cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Real-time system feedback toast/bar */}
      {feedbackMsg && (
        <div className="max-w-6xl mx-auto px-4 mt-6">
          <div className="bg-[#1b2210] border border-emerald-900/60 p-3.5 rounded-xl text-emerald-400 text-xs font-bold flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-300">
            <Check className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>{feedbackMsg}</span>
          </div>
        </div>
      )}

      <main className="max-w-6xl mx-auto px-4 mt-6">
        
        {/* Step Header Block */}
        <div className="bg-[#161618] border border-slate-800 rounded-2xl p-6.5 shadow-2xl mb-8">
          <h2 className="text-sm font-extrabold text-white mb-2 flex items-center gap-2">
            <PlusCircle className="w-4 h-4 text-blue-500" />
            👤 회원 수동 직접 추가 (Pre-approval / Invite)
          </h2>
          <p className="text-[11.5px] text-slate-400 leading-normal mb-5">
            이메일 주소를 입력해 회원을 사전에 직접 생성할 수 있습니다. 등록된 회원은 이메일 로그인 시 즉시 승인 상태로 대시보드에 접근할 수 있습니다.
          </p>

          <form onSubmit={handleAddUser} className="flex flex-col sm:flex-row gap-3">
            <div className="flex-1 relative">
              <input 
                type="text" 
                required
                placeholder="추가하고 싶은 회원의 이메일 주소를 입력하세요 (예: user@example.com)"
                className="w-full bg-[#0A0A0B] border border-slate-700 rounded-xl px-4 py-3 text-xs font-semibold placeholder-slate-600 font-mono text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                value={newEmail}
                onChange={e => setNewEmail(e.target.value)}
              />
            </div>
            
            <div className="flex items-center gap-3">
              <select 
                className="bg-[#0A0A0B] border border-slate-700 text-xs text-slate-300 rounded-xl py-3 px-3.5 font-bold focus:outline-none"
                value={newStatus}
                onChange={e => setNewStatus(e.target.value as any)}
              >
                <option value="approved">✅ 즉시 승인 상태 등록</option>
                <option value="pending">⏳ 승인 대기 단계 등록</option>
              </select>

              <button
                type="submit"
                disabled={actionLoading}
                className="bg-blue-600 hover:bg-blue-500 py-3 px-5 text-xs text-white rounded-xl font-extrabold flex items-center gap-1.5 cursor-pointer hover:shadow-lg hover:shadow-blue-600/15 transition-all disabled:opacity-50"
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Plus className="w-3.5 h-3.5" />
                )}
                <span>목록에 추가</span>
              </button>
            </div>
          </form>
        </div>

        {/* Loading Indicator */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 bg-[#161618] border border-slate-800 rounded-2xl shadow-xl gap-3">
            <Loader2 className="w-7 h-7 text-amber-500 animate-spin" />
            <p className="text-xs text-slate-500 font-medium">실시간 데이터베이스 회원 현황을 조회 중입니다...</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* L: PENDING SECTION */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse block" />
                  ⏳ 가입 승인 대기 명단 ({pendingUsers.length}명)
                </h3>
                <span className="text-[11px] font-bold text-slate-500">대기 인원</span>
              </div>

              <div className="bg-[#161618] border border-slate-800 rounded-2xl p-4.5 shadow-xl flex flex-col gap-3 min-h-[350px]">
                {pendingUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center flex-1">
                    <Clock className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400 font-bold">현재 승인을 대기 중인 신규 회원이 없습니다.</p>
                    <p className="text-[10px] text-slate-600 mt-1">사용자가 무료회원가입/구글 가입을 하면 실시간으로 여기에 뜹니다.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 space-y-2.5">
                    {pendingUsers.map((user) => (
                      <div key={user.uid} className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-none">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-2">
                          {editingUid === user.uid ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="bg-[#0A0A0B] border border-blue-500 rounded px-2 py-1 text-xs text-white flex-1 outline-none font-semibold font-mono"
                                value={editingEmail}
                                onChange={e => setEditingEmail(e.target.value)}
                              />
                              <button
                                onClick={() => handleSaveEmail(user.uid)}
                                className="p-1.5 bg-emerald-950 text-emerald-400 rounded-lg hover:bg-emerald-900 border border-emerald-900"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-[#ECECEC] font-mono truncate text-xs">{user.email}</span>
                              <button
                                onClick={() => {
                                  setEditingUid(user.uid);
                                  setEditingEmail(user.email);
                                }}
                                className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors"
                                title="이메일 수정"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <span className="text-[10.5px] text-slate-500 font-semibold font-mono">가입일: {new Date(user.createdAt).toLocaleString('ko-KR')}</span>
                        </div>

                        {/* Approved and Rejected Buttons Behind / Next to items */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <button
                            onClick={() => handleApprove(user.uid)}
                            className="bg-emerald-600/90 hover:bg-emerald-500 text-white font-extrabold py-2 px-3 rounded-lg text-[11px] transition-all cursor-pointer flex items-center gap-1 hover:shadow-md hover:shadow-emerald-500/10"
                          >
                            <Check className="w-3 h-3" />
                            <span>승인</span>
                          </button>
                          
                          <button
                            onClick={() => handleReject(user.uid)}
                            className="bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-900/40 py-2 px-3 rounded-lg text-[11px] transition-all cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3 h-3" />
                            <span>거부</span>
                          </button>

                          <button
                            onClick={() => handleDeleteUser(user.uid)}
                            className="p-2 bg-[#0A0A0B] border border-slate-800 text-slate-500 hover:text-red-500 hover:border-red-950 rounded-lg transition-colors cursor-pointer"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* R: APPROVED SECTION */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-[#ECECEC] flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-emerald-500" />
                  ✅ 승인 완료 회원 명단 ({approvedUsers.length}명)
                </h3>
                <span className="text-[11px] font-bold text-emerald-500">정상 회원</span>
              </div>

              <div className="bg-[#161618] border border-slate-800 rounded-2xl p-4.5 shadow-xl flex flex-col gap-3 min-h-[350px]">
                {approvedUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-20 text-center flex-1">
                    <Users className="w-10 h-10 text-slate-600 mb-2" />
                    <p className="text-xs text-slate-400 font-bold">임의의 가입 혹은 승인 대기 승인된 유저가 존재하지 않습니다.</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/70 space-y-2.5">
                    {approvedUsers.map((user) => (
                      <div key={user.uid} className="pt-2.5 first:pt-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs leading-none">
                        <div className="flex flex-col gap-1.5 flex-1 min-w-0 pr-2">
                          {editingUid === user.uid ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                className="bg-[#0A0A0B] border border-blue-500 rounded px-2 py-1 text-xs text-white flex-1 outline-none font-semibold font-mono"
                                value={editingEmail}
                                onChange={e => setEditingEmail(e.target.value)}
                              />
                              <button
                                onClick={() => handleSaveEmail(user.uid)}
                                className="p-1.5 bg-emerald-950 text-emerald-400 rounded-lg hover:bg-emerald-900 border border-emerald-900"
                              >
                                <Save className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-[#ECECEC] font-mono truncate text-xs">{user.email}</span>
                              <button
                                onClick={() => {
                                  setEditingUid(user.uid);
                                  setEditingEmail(user.email);
                                }}
                                className="text-slate-500 hover:text-slate-300 p-0.5 transition-colors"
                                title="이메일 수정"
                              >
                                <Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          <span className="text-[10.5px] text-slate-500 font-semibold font-mono">생성일: {new Date(user.createdAt).toLocaleString('ko-KR')}</span>
                        </div>

                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                          <span className="inline-block px-2.5 py-1 text-[10.5px] font-bold text-emerald-400 bg-emerald-950/30 border border-emerald-900/30 rounded-full select-none">
                            승인완료
                          </span>
                          
                          <button
                            onClick={() => handleReject(user.uid)}
                            className="bg-yellow-600/10 hover:bg-yellow-600/20 text-yellow-400 border border-yellow-900/30 py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
                            title="다시 대기로 변경"
                          >
                            대기로 회수
                          </button>

                          <button
                            onClick={() => handleDeleteUser(user.uid)}
                            className="p-2 bg-[#0A0A0B] border border-slate-800 text-slate-500 hover:text-red-500 hover:border-red-950 rounded-lg transition-colors cursor-pointer"
                            title="회원 삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* REJECTED MEMBERS list if there are any, styled compactly */}
        {rejectedUsers.length > 0 && (
          <div className="mt-8 bg-[#161618] border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h4 className="text-xs font-extrabold text-red-400 uppercase tracking-widest mb-3.5 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-red-500 inline-block shrink-0" />
              🛑 거절 처리된 이메일 기록 ({rejectedUsers.length}개)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
              {rejectedUsers.map((user) => (
                <div key={user.uid} className="bg-[#0A0A0B] border border-slate-850 p-3 rounded-xl flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <p className="font-extrabold text-slate-400 font-mono truncate">{user.email}</p>
                    <p className="text-[9.5px] text-slate-600 font-mono mt-0.5">거절일: {new Date(user.createdAt).toLocaleDateString()}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => handleApprove(user.uid)}
                      className="text-xs font-bold text-emerald-400 bg-emerald-950/20 px-2 py-1 rounded hover:bg-emerald-950/50 border border-emerald-950 cursor-pointer"
                    >
                      승인으로 복구
                    </button>
                    <button
                      onClick={() => handleDeleteUser(user.uid)}
                      className="p-1 pb-0.5 text-slate-600 hover:text-red-400 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}
