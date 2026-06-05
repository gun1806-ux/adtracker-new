import { useState, useEffect, useMemo, FormEvent } from 'react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase';
import { collection, query, where, onSnapshot, addDoc, setDoc, doc, serverTimestamp, deleteDoc } from 'firebase/firestore';
import { LinkEntity, ClickEntity } from '../types';
import { nanoid } from 'nanoid';
import { 
  Link2, 
  ExternalLink, 
  Copy, 
  QrCode, 
  TrendingUp, 
  Smartphone, 
  Monitor, 
  LogOut, 
  Plus, 
  Check, 
  BarChart2, 
  Layers, 
  Clock, 
  ArrowRight,
  Sparkles,
  RefreshCw,
  Search,
  Trash2,
  Loader2
} from 'lucide-react';
import QRCode from 'qrcode';

function getPublicShortUrl(trackingId: string): string {
  const origin = window.location.origin;
  const cleanOrigin = origin.endsWith('/') ? origin.slice(0, -1) : origin;
  return `${cleanOrigin}/r/${trackingId}`;
}

interface DashboardProps {
  user: any;
}

export default function Dashboard({ user }: DashboardProps) {
  const [links, setLinks] = useState<LinkEntity[]>([]);
  const [clicks, setClicks] = useState<ClickEntity[]>([]);
  const [linksLoaded, setLinksLoaded] = useState(false);
  const [clicksLoaded, setClicksLoaded] = useState(false);
  const [url, setUrl] = useState('');
  const [channel, setChannel] = useState('인스타그램');
  const [customChannel, setCustomChannel] = useState('');
  const [creating, setCreating] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [qrUrls, setQrUrls] = useState<{[key: string]: string}>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [showBulkConfirm, setShowBulkConfirm] = useState(false);
  const [deletingBulk, setDeletingBulk] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [activePeriod, setActivePeriod] = useState<'weekly' | 'monthly'>('weekly');

  // --- Brand New Product Tags Feature States & Effects ---
  interface ProductTag {
    id: string;
    name: string;
  }
  const [productTags, setProductTags] = useState<ProductTag[]>([]);
  const [activeTagId, setActiveTagId] = useState<string>('all');
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [editingTagName, setEditingTagName] = useState<string>('');
  const [selectedTagId, setSelectedTagId] = useState<string>('');

  // 1. Initial Load of customized user tags from LocalStorage
  useEffect(() => {
    const key = `adtracker_tags_${user.uid}`;
    const stored = localStorage.getItem(key);
    let tagsList: ProductTag[] = [];

    if (stored) {
      try {
        tagsList = JSON.parse(stored);
      } catch (e) {
        tagsList = [];
      }
    }

    if (!tagsList || tagsList.length === 0) {
      tagsList = [
        { id: 'tag-1', name: '제품 1' },
        { id: 'tag-2', name: '제품 2' },
        { id: 'tag-3', name: '제품 3' },
        { id: 'tag-4', name: '제품 4' },
        { id: 'tag-5', name: '제품 5' }
      ];
      localStorage.setItem(key, JSON.stringify(tagsList));
    }
    setProductTags(tagsList);
    setSelectedTagId(tagsList[0]?.id || '');
  }, [user.uid]);

  // Synchronize dynamic form selector when current active tag filter toggles
  useEffect(() => {
    if (activeTagId !== 'all') {
      setSelectedTagId(activeTagId);
    } else if (productTags.length > 0) {
      setSelectedTagId(productTags[0].id);
    }
  }, [activeTagId, productTags]);

  // Create new product tags with collision-less auto-generated id
  const handleAddNewTag = () => {
    const nextNum = productTags.length + 1;
    const newId = `tag-${nanoid(4)}`;
    const newTag: ProductTag = { id: newId, name: `제품 ${nextNum}` };
    const updated = [...productTags, newTag];
    setProductTags(updated);
    localStorage.setItem(`adtracker_tags_${user.uid}`, JSON.stringify(updated));
    setEditingTagId(newId);
    setEditingTagName(`제품 ${nextNum}`);
  };

  // Save modified tag name safely
  const handleSaveTagName = (tagId: string) => {
    const finalName = editingTagName.trim();
    if (!finalName) {
      setEditingTagId(null);
      return;
    }
    const updated = productTags.map(tag => {
      if (tag.id === tagId) {
        return { ...tag, name: finalName };
      }
      return tag;
    });
    setProductTags(updated);
    localStorage.setItem(`adtracker_tags_${user.uid}`, JSON.stringify(updated));
    setEditingTagId(null);
  };

  // --- End of Brand New Product Tags Core ---

  // 1. Subscribe to Tracker Links (We sort client-side to prevent missing index errors)
  useEffect(() => {
    const linksQuery = query(
      collection(db, 'links'),
      where('userId', '==', user.uid)
    );

    const unsubscribeLinks = onSnapshot(linksQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as LinkEntity[];

      // Sort client-side by createdAt descending safely
      data.sort((a, b) => {
        const timeA = a.createdAt?.seconds || 0;
        const timeB = b.createdAt?.seconds || 0;
        return timeB - timeA;
      });

      setLinks(data);
      setLinksLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'links');
      setLinksLoaded(true); // Prevent lockup
    });

    // 2. Subscribe to Clicks for analytics
    const clicksQuery = query(
      collection(db, 'clicks'),
      where('linkOwnerId', '==', user.uid)
    );

    const unsubscribeClicks = onSnapshot(clicksQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as ClickEntity[];
      setClicks(data);
      setClicksLoaded(true);
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'clicks');
      setClicksLoaded(true); // Prevent lockup
    });

    return () => {
      unsubscribeLinks();
      unsubscribeClicks();
    };
  }, [user.uid]);

  // Handle URL Form submission
  const handleCreateLink = async (e: FormEvent) => {
    e.preventDefault();
    let finalUrl = url.trim();
    if (!finalUrl) return;

    // Helper to auto-prepend https:// if missing
    if (!/^https?:\/\//i.test(finalUrl)) {
      finalUrl = 'https://' + finalUrl;
    }

    setCreating(true);
    // Generate randomized unique 6 character tracker ID using collision-free nanoid
    const trackingId = nanoid(6);
    const selectedChannel = channel === '직접입력' ? (customChannel.trim() || '연구/기타') : channel;

    try {
      await setDoc(doc(db, 'links', trackingId), {
        trackingId,
        userId: user.uid,
        originalUrl: finalUrl,
        channel: selectedChannel,
        tag: selectedTagId,
        createdAt: serverTimestamp()
      });
      setUrl('');
      setCustomChannel('');
      // Trigger instant success banner or alert
    } catch (error: any) {
      alert('링크 분실 관리자용 발급에 실패하였습니다: ' + error.message);
    } finally {
      setCreating(false);
    }
  };

  // Modern clipboard copy helper
  const handleCopyLink = (trackingId: string) => {
    const shortUrl = getPublicShortUrl(trackingId);
    navigator.clipboard.writeText(shortUrl)
      .then(() => {
        setCopiedId(trackingId);
        setTimeout(() => setCopiedId(null), 2000);
      })
      .catch((err) => {
        // Safe document-fallback
        try {
          const tempInput = document.createElement('input');
          tempInput.value = shortUrl;
          document.body.appendChild(tempInput);
          tempInput.select();
          document.execCommand('copy');
          document.body.removeChild(tempInput);
          setCopiedId(trackingId);
          setTimeout(() => setCopiedId(null), 2000);
        } catch (_) {
          alert('복사 실패. 수동으로 링크를 복사하세요: ' + shortUrl);
        }
      });
  };

  // Toggle QR Code image conversion in-memory
  const handleToggleQR = async (trackingId: string) => {
    if (qrUrls[trackingId]) {
      const updated = { ...qrUrls };
      delete updated[trackingId];
      setQrUrls(updated);
    } else {
      const shortUrl = getPublicShortUrl(trackingId);
      try {
        const qrBase64 = await QRCode.toDataURL(shortUrl, {
          width: 200,
          margin: 1,
          color: {
            dark: '#1e293b', // Deep Slate
            light: '#ffffff'
          }
        });
        setQrUrls({ ...qrUrls, [trackingId]: qrBase64 });
      } catch (err) {
        console.error('QR code generation error:', err);
      }
    }
  };

  // Individual link deletion handler
  const handleDeleteLink = async (linkId: string, trackingId: string) => {
    setDeletingId(linkId);
    try {
      // 1. Delete associated clicks first
      const associatedClicks = clicks.filter(c => c.trackingId === trackingId);
      const deleteClicksPromises = associatedClicks.map(async (click) => {
        if (!click.id) return;
        try {
          await deleteDoc(doc(db, 'clicks', click.id));
        } catch (err) {
          console.error(`Failed to delete associated click ${click.id}:`, err);
        }
      });
      await Promise.all(deleteClicksPromises);

      // 2. Delete the tracker link entry using its actual document ID
      await deleteDoc(doc(db, 'links', linkId));
      
      if (qrUrls[trackingId]) {
        const updated = { ...qrUrls };
        delete updated[trackingId];
        setQrUrls(updated);
      }
      setConfirmDeleteId(null);
    } catch (error: any) {
      console.error('삭제 중 실패했습니다: ', error);
    } finally {
      setDeletingId(null);
    }
  };

  // Bulk delete all tracking links & clicks handler
  const handleBulkDelete = async () => {
    setDeletingBulk(true);
    try {
      // Delete All Links using their actual Firestore document id (link.id)
      const deleteLinksPromises = links.map(async (link) => {
        if (!link.id) return;
        try {
          await deleteDoc(doc(db, 'links', link.id));
        } catch (err) {
          console.error(`Failed to delete link ${link.id}:`, err);
        }
      });
      await Promise.all(deleteLinksPromises);

      // Delete All Clicks using their actual Firestore document id (click.id)
      const deleteClicksPromises = clicks.map(async (click) => {
        if (!click.id) return;
        try {
          await deleteDoc(doc(db, 'clicks', click.id));
        } catch (err) {
          console.error(`Failed to delete click ${click.id}:`, err);
        }
      });
      await Promise.all(deleteClicksPromises);

      setQrUrls({});
      setShowBulkConfirm(false);
    } catch (error: any) {
      alert('전체 삭제 시도 중 실패했습니다: ' + error.message);
    } finally {
      setDeletingBulk(false);
    }
  };

  // Channel helper returns consistent visual attributes
  const getChannelStyle = (ch: string) => {
    switch(ch) {
      case '인스타그램':
        return { bg: 'bg-pink-950/30 text-pink-400 border-pink-900/40', dot: 'bg-pink-500' };
      case '블로그':
        return { bg: 'bg-emerald-950/30 text-emerald-400 border-emerald-900/40', dot: 'bg-emerald-500' };
      case '당근마켓':
        return { bg: 'bg-orange-950/30 text-orange-400 border-orange-900/40', dot: 'bg-orange-500' };
      case '유튜브':
        return { bg: 'bg-red-950/30 text-red-400 border-red-900/40', dot: 'bg-red-500' };
      case '카카오톡':
        return { bg: 'bg-amber-950/30 text-amber-400 border-amber-900/40', dot: 'bg-amber-500' };
      case '페이스북':
        return { bg: 'bg-blue-950/30 text-blue-400 border-blue-900/40', dot: 'bg-blue-500' };
      default:
        return { bg: 'bg-slate-900/40 text-slate-400 border-slate-800', dot: 'bg-slate-500' };
    }
  };

  // Helper to safely parse a click's timestamp
  const getClickDate = (clickedAt: any): Date => {
    if (!clickedAt) return new Date();
    if (typeof clickedAt.toDate === 'function') {
      return clickedAt.toDate();
    }
    if (clickedAt.seconds) {
      return new Date(clickedAt.seconds * 1000);
    }
    return new Date(clickedAt);
  };

  // 1. Filter links based on the active product tag first
  const tagFilteredLinks = useMemo(() => {
    if (activeTagId === 'all') return links;
    return links.filter(link => link.tag === activeTagId);
  }, [links, activeTagId]);

  // 2. Filter links by search query on top of the tag filter
  const filteredLinks = useMemo(() => {
    if (!searchQuery.trim()) return tagFilteredLinks;
    const queryLower = searchQuery.toLowerCase();
    return tagFilteredLinks.filter(link => 
      link.originalUrl.toLowerCase().includes(queryLower) ||
      link.channel.toLowerCase().includes(queryLower) ||
      link.trackingId.toLowerCase().includes(queryLower)
    );
  }, [tagFilteredLinks, searchQuery]);

  // 3. Filter clicks matching only the filtered active links
  const filteredClicksByTag = useMemo(() => {
    if (activeTagId === 'all') return clicks;
    const allowedTrackingIds = new Set(tagFilteredLinks.map(l => l.trackingId));
    return clicks.filter(c => allowedTrackingIds.has(c.trackingId));
  }, [clicks, activeTagId, tagFilteredLinks]);

  // Statistics calculation for dynamic graph bars
  const stats = useMemo(() => {
    // Device Breakdown totals
    let mobileCount = 0;
    let pcCount = 0;

    // Period channel breakdown maps
    const dailyMap: { [key: string]: number } = {};
    const weeklyMap: { [key: string]: number } = {};
    const monthlyMap: { [key: string]: number } = {};
    const allTimeMap: { [key: string]: number } = {};

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    
    // 7 days ago (includes today)
    const sevenDaysAgoStart = new Date(todayStart);
    sevenDaysAgoStart.setDate(sevenDaysAgoStart.getDate() - 6);
    
    // 30 days ago (includes today)
    const thirtyDaysAgoStart = new Date(todayStart);
    thirtyDaysAgoStart.setDate(thirtyDaysAgoStart.getDate() - 29);

    filteredClicksByTag.forEach(click => {
      const ch = click.channel || '기타';
      allTimeMap[ch] = (allTimeMap[ch] || 0) + 1;
      
      if (click.deviceType === 'Mobile') {
        mobileCount++;
      } else {
        pcCount++;
      }

      // Parse click timestamp
      const clickDate = getClickDate(click.clickedAt);

      // 1. Daily (Today)
      if (clickDate >= todayStart) {
        dailyMap[ch] = (dailyMap[ch] || 0) + 1;
      }

      // 2. Weekly (Last 7 days)
      if (clickDate >= sevenDaysAgoStart) {
        weeklyMap[ch] = (weeklyMap[ch] || 0) + 1;
      }

      // 3. Monthly (Last 30 days)
      if (clickDate >= thirtyDaysAgoStart) {
        monthlyMap[ch] = (monthlyMap[ch] || 0) + 1;
      }
    });

    const totalClicksCount = filteredClicksByTag.length;

    // Helper to build list with score based on relative performance index
    const buildSortedChannelsWithScore = (channelMap: { [key: string]: number }) => {
      const list = Object.keys(channelMap).map(ch => ({
        name: ch,
        count: channelMap[ch],
      }));

      const totalPeriodClicks = list.reduce((sum, item) => sum + item.count, 0);
      const maxPeriodClicks = list.length > 0 ? Math.max(...list.map(c => c.count)) : 1;

      return list.map(chan => {
        // Core performance score calculation: relative performance index out of 100
        const relativeScore = Math.round((chan.count / maxPeriodClicks) * 100);
        const periodPercentage = totalPeriodClicks > 0 ? Math.round((chan.count / totalPeriodClicks) * 100) : 0;
        
        return {
          name: chan.name,
          count: chan.count,
          score: relativeScore,
          percentage: periodPercentage
        };
      }).sort((a, b) => b.count - a.count);
    };

    const dailyChannels = buildSortedChannelsWithScore(dailyMap);
    const weeklyChannels = buildSortedChannelsWithScore(weeklyMap);
    const monthlyChannels = buildSortedChannelsWithScore(monthlyMap);
    const sortedChannels = buildSortedChannelsWithScore(allTimeMap);

    const mobilePercent = totalClicksCount > 0 ? Math.round((mobileCount / totalClicksCount) * 100) : 0;
    const pcPercent = totalClicksCount > 0 ? Math.round((pcCount / totalClicksCount) * 100) : 0;

    return {
      totalClicksCount,
      sortedChannels,
      dailyChannels,
      weeklyChannels,
      monthlyChannels,
      mobileCount,
      pcCount,
      mobilePercent,
      pcPercent
    };
  }, [filteredClicksByTag]);

  const loadingData = !linksLoaded || !clicksLoaded;

  if (loadingData) {
    return (
      <div className="min-h-screen bg-[#0A0A0B] text-slate-200 relative font-sans leading-normal">
        <header className="bg-[#111113]/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-800 shadow-xs">
          <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black shadow-md shadow-blue-500/10">
                <Link2 className="w-4.5 h-4.5 rotate-45" />
              </span>
              <div>
                <h1 className="text-base font-bold text-white leading-none">AdTracker <span className="text-blue-500 text-xs uppercase tracking-widest font-black">PRO</span></h1>
                <p className="text-[10px] text-slate-400 font-medium">광고 성과 측정 대시보드</p>
              </div>
            </div>
          </div>
        </header>
        <main className="max-w-6xl mx-auto px-4 mt-16 flex flex-col items-center justify-center py-24 text-center">
          <div className="bg-[#161618] p-10 rounded-2xl border border-slate-800 shadow-2xl max-w-sm w-full flex flex-col items-center justify-center">
            <Loader2 className="w-9 h-9 text-blue-500 animate-spin mb-4" />
            <h2 className="text-sm font-bold text-slate-300 mb-1.5">실시간 통계 데이터 라이브 동기화</h2>
            <p className="text-xs text-slate-500 max-w-xs font-semibold leading-relaxed">
              안전한 Firestore 클라우드 채널을 통해 광고 링크 및 유입 통계 성과 지표 데이터를 실시간으로 동기화하고 있습니다...
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-slate-200 relative font-sans leading-normal pb-20">
      
      {/* Header bar */}
      <header className="bg-[#111113]/90 backdrop-blur-md sticky top-0 z-40 border-b border-slate-800 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white font-black shadow-md shadow-blue-500/10">
              <Link2 className="w-4.5 h-4.5 rotate-45" />
            </span>
            <div>
              <h1 className="text-base font-bold text-white leading-none">AdTracker <span className="text-blue-500 text-xs uppercase tracking-widest font-black">PRO</span></h1>
              <p className="text-[10px] text-slate-400 font-medium">광고 성과 측정 대시보드</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs bg-[#161618] py-1.5 px-3 rounded-lg font-semibold text-slate-300 border border-slate-800 hidden sm:inline">
              {user.email}
            </span>
            <button 
              onClick={() => auth.signOut()} 
              className="text-xs font-bold text-slate-400 hover:text-red-400 hover:bg-red-950/30 p-2 rounded-lg transition-all flex items-center gap-1.5 border border-transparent hover:border-red-900/30 cursor-pointer bg-transparent"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>로그아웃</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-6xl mx-auto px-4 mt-8">
        
        {/* 🏷️ 제품별 분류 태그 관리 및 필터 섹션 */}
        <div className="bg-[#161618] p-5 rounded-2xl border border-slate-800 shadow-2xl mb-8">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2.5">
            <div>
              <h2 className="text-sm font-extrabold text-white flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block animate-pulse" />
                🏷️ 제품별 분류 태그 관리 및 필터
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5 font-medium">각 태그를 클릭해 해당 상품의 유입량 및 보유 링크 현황을 변경/통계 필터링할 수 있습니다.</p>
            </div>
            <div className="text-[10px] sm:text-[11px] font-bold text-slate-500 bg-[#0A0A0B] py-1 px-2.5 rounded border border-slate-800/80">
              💡 태그 이름을 수정하려면 연필(✏️) 모양을 클릭하고, 우측 '+'를 눌러 새 제품 태그를 추가해 보세요.
            </div>
          </div>

          {/* Flex-wrap container: wraps to two lines if tags exceed available pixels width, naturally stretching the card height */}
          <div className="flex flex-wrap gap-2.5 items-center">
            {/* All links category filter button */}
            <button
              onClick={() => setActiveTagId('all')}
              className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer border flex items-center gap-1.5 ${
                activeTagId === 'all'
                  ? 'bg-blue-600 border-transparent text-white shadow-lg shadow-blue-500/10'
                  : 'bg-[#0A0A0B] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700 hover:bg-[#111113]'
              }`}
            >
              <span>📂 전체 보기</span>
            </button>

            {/* User custom / default product tags array lookup */}
            {productTags.map((tag) => {
              const isEditing = editingTagId === tag.id;
              const isActive = activeTagId === tag.id;

              return (
                <div
                  key={tag.id}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-all border shrink-0 ${
                    isActive
                      ? 'bg-blue-600 border-transparent text-white shadow-lg shadow-blue-500/10'
                      : 'bg-[#0A0A0B] border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                  }`}
                >
                  {isEditing ? (
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        autoFocus
                        maxLength={15}
                        className="bg-[#161618] border border-blue-500 rounded px-1.5 py-0.5 text-xs text-white max-w-[110px] outline-none font-bold"
                        value={editingTagName}
                        onChange={(e) => setEditingTagName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') handleSaveTagName(tag.id);
                          if (e.key === 'Escape') setEditingTagId(null);
                        }}
                        onBlur={() => handleSaveTagName(tag.id)}
                      />
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSaveTagName(tag.id);
                        }}
                        className="p-0.5 hover:bg-slate-800 rounded text-emerald-400 cursor-pointer"
                        title="저장"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div 
                      className="flex items-center gap-1.5 cursor-pointer"
                      onClick={() => setActiveTagId(tag.id)}
                    >
                      <span>{tag.name}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingTagId(tag.id);
                          setEditingTagName(tag.name);
                        }}
                        className="p-1 hover:bg-slate-800 rounded-md transition-colors text-slate-500 hover:text-white cursor-pointer"
                        title="태그 이름 수정"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* [+] Button to add new product tags */}
            <button
              onClick={handleAddNewTag}
              className="p-2 py-1.5 rounded-xl text-slate-400 bg-[#0A0A0B] border border-slate-800 hover:bg-[#111113] hover:border-slate-700 hover:text-blue-400 transition-all font-black flex items-center gap-1 cursor-pointer"
              title="새 분류 제품 태그 추가"
            >
              <Plus className="w-4 h-4" />
              <span className="text-xs font-bold font-sans">태그 추가</span>
            </button>
          </div>
        </div>

        {/* Top visual row: Hero banners and KPI cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          
          {/* KPI metrics - Total Clicks */}
          <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
              <TrendingUp className="w-40 h-40 text-blue-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <BarChart2 className="w-4.5 h-4.5 text-blue-500" />
                <span className="text-xs font-bold tracking-tight uppercase">누적 유입 횟수</span>
              </div>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {stats.totalClicksCount} <span className="text-sm font-semibold text-slate-450">회</span>
              </h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-1 text-[11px] text-slate-500">
              <Clock className="w-3 h-3 text-slate-600" />
              <span>방문자의 모든 링크 유입이 실시간 기록됩니다.</span>
            </div>
          </div>

          {/* KPI metrics - Active Links */}
          <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            <div className="absolute right-0 bottom-0 translate-x-3 translate-y-3 opacity-[0.03] group-hover:scale-110 transition-transform duration-500">
              <Layers className="w-40 h-40 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <Link2 className="w-4.5 h-4.5 text-emerald-500 rotate-45" />
                <span className="text-xs font-bold tracking-tight uppercase">보유 링크 개수</span>
              </div>
              <h3 className="text-3xl font-extrabold text-white tracking-tight">
                {tagFilteredLinks.length} <span className="text-sm font-semibold text-slate-450">개</span>
              </h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-1 text-[11px] text-slate-500">
              <Sparkles className="w-3 h-3 text-amber-500" />
              <span>무제한으로 광고 추적 링크와 QR을 생성하세요.</span>
            </div>
          </div>

          {/* KPI metrics - Main conversion channel */}
          <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl flex flex-col justify-between relative overflow-hidden group">
            <div>
              <div className="flex items-center gap-1.5 text-slate-500 mb-1">
                <TrendingUp className="w-4.5 h-4.5 text-violet-500" />
                <span className="text-xs font-bold tracking-tight uppercase">가장 지배적인 유입 채널</span>
              </div>
              <h3 className="text-xl font-extrabold text-slate-300 tracking-tight truncate mt-1">
                {stats.sortedChannels.length > 0 ? (
                  <>
                    <span className="text-blue-500 text-2xl font-black">{stats.sortedChannels[0].name}</span>
                    <span className="text-slate-400 text-sm font-semibold ml-1">
                      ({stats.sortedChannels[0].percentage}%)
                    </span>
                  </>
                ) : (
                  <span className="text-slate-500 text-base font-medium">수집 데이터 없음</span>
                )}
              </h3>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center gap-1 text-[11px] text-slate-500">
              <Check className="w-3 h-3 text-emerald-500" />
              <span>채널별 실시간 랭킹을 토대로 예산을 분배하세요.</span>
            </div>
          </div>
        </div>

        {/* Layout breakdown split */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Columns - Form & Links list */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Link Generation Form Box */}
            <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl relative overflow-hidden">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-base font-extrabold text-white flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-500 inline-block animate-pulse" />
                  신규 광고용 추적 링크 발급
                </h2>
                <span className="text-[11px] font-bold text-blue-400 bg-blue-950/40 py-1 px-2.5 rounded-full">
                  초간편 설정
                </span>
              </div>

              <form onSubmit={handleCreateLink} className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  
                  {/* Real destination URL element */}
                  <div className="md:col-span-6 flex flex-col">
                    <label className="block text-xs font-extrabold text-slate-400 mb-1.5 uppercase tracking-wide">
                      어디로 보낼까요? (수집용 원본 주소)
                    </label>
                    <input 
                      type="text" 
                      required
                      placeholder="예: smartstore.naver.com/products/123, youtube.com, 네이버"
                      className="w-full p-3 font-medium bg-[#0A0A0B] border border-slate-700 rounded-xl text-sm focus:outline-none focus:bg-[#0E0E10] focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-200 placeholder-slate-650" 
                      value={url} 
                      onChange={e => setUrl(e.target.value)} 
                    />
                  </div>

                  {/* Channel channel list dropdown */}
                  <div className="md:col-span-3 flex flex-col">
                    <label className="block text-xs font-extrabold text-slate-400 mb-1.5 uppercase tracking-wide">
                      광고 매체 (유입 채널)
                    </label>
                    <select 
                      className="w-full p-3 font-semibold bg-[#0A0A0B] border border-slate-700 rounded-xl text-sm cursor-pointer focus:outline-none focus:bg-[#0E0E10] focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-300"
                      value={channel} 
                      onChange={e => setChannel(e.target.value)}
                    >
                      <option value="인스타그램">📷 인스타그램 (Instagram)</option>
                      <option value="블로그">📝 네이버 블로그 (Blog)</option>
                      <option value="당근마켓">🥕 당근마켓 (Daangn)</option>
                      <option value="유튜브">🎥 유튜브 (YouTube)</option>
                      <option value="카카오톡">💬 카카오톡 (KakaoTalk)</option>
                      <option value="페이스북">🔷 페이스북 (Facebook)</option>
                      <option value="직접입력">✏️ 직접 입력 (커스텀)</option>
                    </select>
                  </div>

                  {/* Dynamic Product Tag selector dropdown */}
                  <div className="md:col-span-3 flex flex-col">
                    <label className="block text-xs font-extrabold text-slate-400 mb-1.5 uppercase tracking-wide">
                      해당 제품 지정 (태그)
                    </label>
                    <select 
                      className="w-full p-3 font-semibold bg-[#0A0A0B] border border-slate-700 rounded-xl text-sm cursor-pointer focus:outline-none focus:bg-[#0E0E10] focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-slate-300 ring-offset-0"
                      value={selectedTagId} 
                      onChange={e => setSelectedTagId(e.target.value)}
                    >
                      {productTags.map(tag => (
                        <option key={tag.id} value={tag.id}>
                          🏷️ {tag.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Custom channel input trigger */}
                {channel === '직접입력' && (
                  <div className="p-4 bg-[#0A0A0B] border border-slate-800 rounded-xl relative animate-fade-in-down">
                    <label className="block text-xs font-bold text-slate-400 mb-1.5">
                      커스텀 채널 이름을 적어주세요 (예: 구글키워드, 네이버카페, 지인카톡)
                    </label>
                    <input 
                      type="text"
                      required
                      maxLength={15}
                      placeholder="예: 뉴스레터A"
                      className="w-full p-2.5 bg-[#161618] border border-slate-700 rounded-xl text-sm text-slate-200"
                      value={customChannel}
                      onChange={e => setCustomChannel(e.target.value)}
                    />
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={creating} 
                  className="w-full bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold py-3.5 px-6 rounded-xl text-sm transition-all focus:ring-2 focus:ring-blue-500/10 shadow-lg shadow-blue-900/10 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-75 disabled:cursor-not-allowed"
                >
                  {creating ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin-fast" />
                      <span>추적용 링크 생성 중...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      <span>추적 링크 발급하기 (실시간 반영)</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Generated Tracker Links List Section */}
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-base font-extrabold text-white flex items-center gap-1.5">
                    📁 나의 광고 추적 링크 목록 
                    <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded-full font-bold">
                      {filteredLinks.length}개
                    </span>
                  </h2>
                  {links.length > 0 && (
                    <button 
                      onClick={() => setShowBulkConfirm(!showBulkConfirm)}
                      className="text-[11px] font-bold text-red-400 hover:text-red-300 hover:bg-red-950/20 px-2.5 py-1 rounded-lg border border-red-900/30 hover:border-red-800/40 cursor-pointer bg-transparent transition-all flex items-center gap-1 animate-fade-in"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>전체 삭제</span>
                    </button>
                  )}
                </div>
                
                {/* Search query element */}
                <div className="relative w-full sm:w-64">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                    <Search className="w-3.5 h-3.5" />
                  </span>
                  <input 
                    type="text" 
                    placeholder="링크, 매체, ID 검색..." 
                    className="w-full pl-8.5 pr-3 py-1.5 bg-[#161618] border border-slate-705 border-slate-700 text-slate-200 placeholder-slate-600 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 transition-all"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                  />
                </div>
              </div>

              {/* Bulk delete confirmation drawer */}
              {showBulkConfirm && (
                <div className="bg-red-950/10 border border-red-900/30 p-4 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 animate-fade-in">
                  <div>
                    <h4 className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <Trash2 className="w-3.5 h-3.5" />
                      정말로 전체 주소 삭제를 진행하시겠습니까?
                    </h4>
                    <p className="text-[11px] text-slate-400 font-semibold mt-0.5">보유 중인 모든 배포 링크({links.length}개)와 방문 요약 실시간 트래픽 데이터가 전부 영구 삭제됩니다.</p>
                  </div>
                  <div className="flex items-center gap-2 self-end sm:self-auto">
                    <button
                      disabled={deletingBulk}
                      onClick={handleBulkDelete}
                      className="bg-red-650 bg-red-600 hover:bg-red-500 text-white text-[11px] font-black py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-55"
                    >
                      {deletingBulk ? '전체 삭제 중...' : '확인, 전체 삭제'}
                    </button>
                    <button
                      disabled={deletingBulk}
                      onClick={() => setShowBulkConfirm(false)}
                      className="bg-slate-800 hover:bg-slate-755 border border-slate-705 text-slate-350 text-[11px] font-extrabold py-1.5 px-3 rounded-lg cursor-pointer"
                    >
                      취소
                    </button>
                  </div>
                </div>
              )}

              {filteredLinks.length === 0 ? (
                <div className="text-center py-16 px-6 bg-[#161618] rounded-2xl border border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-3">
                  <span className="w-12 h-12 rounded-xl bg-[#0A0A0B] flex items-center justify-center text-slate-600">
                    <Link2 className="w-6 h-6 rotate-45" />
                  </span>
                  {searchQuery.trim() ? (
                    <p className="text-sm font-semibold">검색어와 완전히 매칭되는 링크가 존재하지 않습니다.</p>
                  ) : (
                    <>
                      <p className="text-sm font-bold text-slate-400">아직 발급된 광고 추적 링크가 없습니다.</p>
                      <p className="text-xs text-slate-500 max-w-xs">수집용 목적지 URL 주소를 입력하여 첫 번째 성과 관문 추적용 단축링크를 만들어보세요!</p>
                    </>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredLinks.map(link => {
                    const trackingId = link.trackingId;
                    const shortUrl = getPublicShortUrl(trackingId);
                    const linkClicksCount = clicks.filter(c => c.trackingId === trackingId).length;
                    const chStyle = getChannelStyle(link.channel);
                    const linkTagObj = productTags.find(t => t.id === link.tag);
                    const linkTagName = linkTagObj ? linkTagObj.name : '기타/미지정';

                    return (
                      <div 
                        key={link.id} 
                        className="bg-[#161618] rounded-2xl p-5 border border-slate-800 shadow-2xl hover:border-slate-700 transition-all duration-200 flex flex-col gap-4 relative"
                      >
                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-slate-800/60 pb-3">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`inline-flex items-center gap-1.5 text-xs px-3 py-1 rounded-full font-bold border ${chStyle.bg}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${chStyle.dot}`} />
                              {link.channel}
                            </span>
                            <span className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full font-bold bg-[#1e2433] text-blue-300 border border-blue-900/40">
                              🏷️ {linkTagName}
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono tracking-tight bg-[#0A0A0B] px-2 py-0.5 rounded border border-slate-800">
                              ID: {trackingId}
                            </span>
                          </div>
                          
                          {/* Visit counter indicator */}
                          <div className="bg-[#0A0A0B] hover:bg-[#111113] border border-slate-800 rounded-xl px-4 py-1.5 flex items-center gap-2 self-stretch sm:self-auto justify-between">
                            <span className="text-[11px] font-bold text-slate-500">실시간 유입</span>
                            <span className="text-sm font-black text-blue-400 font-mono">{linkClicksCount}회</span>
                          </div>
                        </div>

                        {/* Tracker links visual box */}
                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">광고 삽입용 단축 주소 (이 링크를 배포하세요)</span>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-extrabold text-white break-all select-all hover:text-blue-400 transition-colors">
                                {shortUrl}
                              </span>
                            </div>
                          </div>

                          <div className="pt-1.5">
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block mb-0.5">원본 목적지 이동 주소</span>
                            <span className="text-xs font-medium text-slate-400 truncate block border-l-2 border-slate-800 pl-2 max-w-full">
                              {link.originalUrl}
                            </span>
                          </div>
                        </div>

                        {/* QR Code and Actions trigger strip */}
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800/60">
                          
                          <div className="flex items-center gap-2 w-full sm:w-auto">
                            {/* Copy button */}
                            <button 
                              onClick={() => handleCopyLink(trackingId)}
                              className={`flex-1 sm:flex-none py-2 px-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                                copiedId === trackingId 
                                  ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-400 text-emerald-500' 
                                  : 'bg-blue-600 hover:bg-blue-500 text-white border-transparent'
                              }`}
                            >
                              {copiedId === trackingId ? (
                                <>
                                  <Check className="w-3.5 h-3.5" />
                                  <span>단축링크 복사됨!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3.5 h-3.5" />
                                  <span>배포링크 복사</span>
                                </>
                              )}
                            </button>

                            {/* QR code button trigger */}
                            <button 
                              onClick={() => handleToggleQR(trackingId)}
                              className={`flex-1 sm:flex-none py-2 px-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                                qrUrls[trackingId]
                                  ? 'bg-slate-800 border-slate-700 text-slate-300 font-extrabold'
                                  : 'bg-[#0A0A0B] hover:bg-[#111113] text-slate-400 border-slate-800 hover:border-slate-700'
                              }`}
                            >
                              <QrCode className="w-3.5 h-3.5" />
                              <span>{qrUrls[trackingId] ? 'QR 닫기' : 'QR 코드 보기'}</span>
                            </button>
                          </div>

                          <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                            {/* Inline redirection verify browser helper */}
                            <a 
                              href={shortUrl} 
                              target="_blank" 
                              rel="noopener noreferrer" 
                              className="flex-1 sm:flex-none text-center bg-[#0A0A0B] hover:bg-[#111113] border border-slate-800 text-slate-400 py-2 px-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer"
                            >
                              <span>미리보기</span>
                              <ExternalLink className="w-3" />
                            </a>

                            {/* Individual Delete Link */}
                            {confirmDeleteId === link.id ? (
                              <div className="flex items-center gap-1.5 animate-fade-in bg-red-950/20 border border-red-900/40 p-1 rounded-xl">
                                <span className="text-[10px] text-red-400 font-bold px-1.5">정말 삭제?</span>
                                <button
                                  disabled={deletingId === link.id}
                                  onClick={() => handleDeleteLink(link.id || '', trackingId)}
                                  className="bg-red-600 hover:bg-red-500 text-white font-bold text-[11.5px] py-1 px-2.5 rounded-lg cursor-pointer transition-all disabled:opacity-50"
                                >
                                  {deletingId === link.id ? '삭제중' : '확인'}
                                </button>
                                <button
                                  disabled={deletingId === link.id}
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium text-[11px] py-1 px-2.5 rounded-lg cursor-pointer transition-all"
                                >
                                  취소
                                </button>
                              </div>
                            ) : (
                              <button
                                disabled={deletingId === (link.id || '')}
                                onClick={() => setConfirmDeleteId(link.id || null)}
                                className="text-center bg-red-950/20 hover:bg-red-950/40 border border-red-900/40 hover:border-red-800 text-red-400 py-2 px-3.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1 cursor-pointer disabled:opacity-50"
                                title="링크 삭제"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>삭제</span>
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Expanding QR code element */}
                        {qrUrls[trackingId] && (
                          <div className="bg-[#0A0A0B] p-4 rounded-xl border border-slate-800 flex flex-col items-center justify-center gap-3 animate-fade-in">
                            <span className="text-[11px] font-bold text-slate-400">지면 광고 매체(배너, 명함, 전단지) 삽입용 이미지 QR 코드</span>
                            <div className="bg-white p-2.5 rounded-lg border border-slate-800 flex items-center justify-center shadow-lg">
                              <img src={qrUrls[trackingId]} alt="QR Code" className="w-32 h-32 select-none" referrerPolicy="no-referrer" />
                            </div>
                            <span className="text-[10px] text-slate-500 font-medium">마우스 우클릭을 하거나 이미지를 가볍게 눌러 저장하실 수 있습니다.</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Right Column - Channel Funnels and Devices ratio */}
          <div className="space-y-6">
            
            {/* 1. 일별 채널 성과 점수 (오늘) */}
            <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl space-y-4">
              <div className="border-b border-slate-800/60 pb-3">
                <div className="flex items-center gap-1.5 text-blue-400 mb-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                  <span className="text-[10px] font-extrabold tracking-wider uppercase">일별 라이브 대시보드</span>
                </div>
                <h2 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                  <BarChart2 className="w-4 h-4 text-blue-500" />
                  일별 채널 성과 점수 (오늘)
                </h2>
              </div>

              <div className="space-y-4">
                {stats.dailyChannels.length === 0 ? (
                  <div className="text-center py-10 bg-[#0A0A0B]/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    <Clock className="w-5 h-5 text-slate-600 mx-auto mb-2" />
                    오늘 수집된 광고 매체별 유입이 아직 없습니다.<br />
                    <span className="opacity-60 text-[10px] block mt-1">배포 및 단축링크 유치를 시작해 보세요!</span>
                  </div>
                ) : (
                  stats.dailyChannels.map((chan, idx) => {
                    const style = getChannelStyle(chan.name);
                    return (
                      <div key={idx} className="space-y-1.5 p-3 rounded-xl bg-[#0A0A0B]/30 border border-slate-800/40 relative overflow-hidden group">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded text-[10px] font-bold uppercase border ${style.bg}`}>
                            <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                            {chan.name}
                          </span>
                          <div className="flex items-center gap-2 text-right">
                            <span className="text-blue-400 font-extrabold">
                              성과 {chan.score}점
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {chan.count}회 유입
                            </span>
                          </div>
                        </div>
                        
                        {/* Custom horizontal progress meter */}
                        <div className="w-full bg-[#0A0A0B] rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${style.dot}`} 
                            style={{ width: `${chan.score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* 2. 기간별 채널 성과 점수 (주간/월간) with Tags/Chips */}
            <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl space-y-4">
              <div className="border-b border-slate-800/60 pb-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <div className="flex items-center gap-1.5 text-indigo-400 mb-1">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" />
                    <span className="text-[10px] font-extrabold tracking-wider uppercase">중장기 시계열 집계</span>
                  </div>
                  <h2 className="text-sm font-extrabold text-white tracking-tight flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-400" />
                    기간별 성과 추이 점수
                  </h2>
                </div>

                {/* Tags Selectors */}
                <div className="flex gap-1.5 bg-[#0A0A0B] p-0.5 rounded-lg border border-slate-800 shrink-0">
                  <button
                    onClick={() => setActivePeriod('weekly')}
                    className={`px-3 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
                      activePeriod === 'weekly'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    주별 (7일)
                  </button>
                  <button
                    onClick={() => setActivePeriod('monthly')}
                    className={`px-3 py-1 rounded-md text-[10.5px] font-extrabold transition-all cursor-pointer ${
                      activePeriod === 'monthly'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    월별 (30일)
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {(activePeriod === 'weekly' ? stats.weeklyChannels : stats.monthlyChannels).length === 0 ? (
                  <div className="text-center py-10 bg-[#0A0A0B]/40 rounded-xl border border-dashed border-slate-800 text-slate-500 text-xs">
                    최근 해당 기간 내 수집된 유입 로그가 없습니다.
                  </div>
                ) : (
                  (activePeriod === 'weekly' ? stats.weeklyChannels : stats.monthlyChannels).map((chan, idx) => {
                    const style = getChannelStyle(chan.name);
                    return (
                      <div key={idx} className="space-y-1.5 p-3 rounded-xl bg-[#0A0A0B]/30 border border-slate-800/40 relative overflow-hidden group">
                        <div className="flex items-center justify-between text-xs">
                          <span className={`inline-flex items-center gap-1 py-0.5 px-2 rounded text-[10px] font-bold uppercase border ${style.bg}`}>
                            <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                            {chan.name}
                          </span>
                          <div className="flex items-center gap-2 text-right">
                            <span className="text-indigo-400 font-extrabold">
                              성과 {chan.score}점
                            </span>
                            <span className="font-mono text-[10px] text-slate-500">
                              {chan.count}회 유입 ({chan.percentage}%)
                            </span>
                          </div>
                        </div>
                        
                        {/* Custom horizontal progress meter */}
                        <div className="w-full bg-[#0A0A0B] rounded-full h-1.5 overflow-hidden">
                          <div 
                            className={`h-full rounded-full transition-all duration-500 ${style.dot}`} 
                            style={{ width: `${chan.score}%` }}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

            {/* Smart Device Segment Ratio bar */}
            <div className="bg-[#161618] p-6 rounded-2xl border border-slate-800 shadow-2xl">
              <h2 className="text-sm font-extrabold text-white tracking-tight mb-4 flex items-center gap-2 border-b border-slate-800/60 pb-2.5">
                <Smartphone className="w-4 h-4 text-emerald-500" />
                모바일 vs PC 분석 비율
              </h2>

              <div className="space-y-4">
                {stats.totalClicksCount === 0 ? (
                  <div className="text-center py-8 text-slate-500 text-xs">
                    접속 브라우저 데이터가 존재하지 않습니다.
                  </div>
                ) : (
                  <div className="space-y-4">
                    
                    {/* Visual Segment block display */}
                    <div className="w-full h-4 rounded-lg overflow-hidden flex bg-[#0A0A0B] font-bold text-[9px] text-white">
                      {stats.mobilePercent > 0 && (
                        <div 
                          className="bg-emerald-500 flex items-center justify-center transition-all duration-500"
                          style={{ width: `${stats.mobilePercent}%` }}
                        >
                          {stats.mobilePercent}%
                        </div>
                      )}
                      {stats.pcPercent > 0 && (
                        <div 
                          className="bg-amber-500 flex items-center justify-center transition-all duration-500"
                          style={{ width: `${stats.pcPercent}%` }}
                        >
                          {stats.pcPercent}%
                        </div>
                      )}
                    </div>

                    {/* Numeric cards breakdown layout */}
                    <div className="grid grid-cols-2 gap-3">
                      
                      {/* Mobile Card details */}
                      <div className="p-3 bg-emerald-950/20 border border-emerald-900/30 rounded-xl">
                        <div className="flex items-center gap-1 text-emerald-400 font-bold text-[10px] uppercase mb-1">
                          <Smartphone className="w-3.5 h-3.5" />
                          <span>모바일/태블릿</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {stats.mobileCount} <span className="text-[10px] font-semibold text-slate-500 font-sans">건</span>
                        </div>
                      </div>

                      {/* PC Desktop Card details */}
                      <div className="p-3 bg-amber-950/20 border border-amber-900/30 rounded-xl">
                        <div className="flex items-center gap-1 text-amber-400 font-bold text-[10px] uppercase mb-1">
                          <Monitor className="w-3.5 h-3.5" />
                          <span>PC 크롬/익스</span>
                        </div>
                        <div className="text-lg font-black text-white font-mono">
                          {stats.pcCount} <span className="text-[10px] font-semibold text-slate-500 font-sans">건</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Micro FAQ Help Panel */}
            <div className="p-5 bg-blue-950/20 border border-blue-900/30 rounded-2xl space-y-2.5">
              <h4 className="text-xs font-extrabold text-blue-400 uppercase tracking-wide">💡 성과 측정 가이드</h4>
              <ul className="text-[11px] font-semibold text-slate-400 space-y-1.5 list-none pl-0">
                <li className="flex items-start gap-1">
                  <span className="text-blue-400 block shrink-0">1.</span>
                  <span>단축 생성된 <strong>배포링크 주소</strong>를 그대로 광고 캠페인 위치에 집어넣으세요.</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-blue-400 block shrink-0">2.</span>
                  <span>인스타그램 광고, 네이버 블로그 링크, 명함 전단지용 QR 등을 개별 구분 발급하여 유통하면 효율을 세밀하게 구별하게 됩니다.</span>
                </li>
                <li className="flex items-start gap-1">
                  <span className="text-blue-400 block shrink-0">3.</span>
                  <span>모든 유입은 즉각 집계되어 실시간으로 업데이트됩니다.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
