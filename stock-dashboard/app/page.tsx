'use client';
import { useState, useEffect, useLayoutEffect, useRef, KeyboardEvent } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface ChartData {
  date: string;
  price: number;
}

interface StockResult {
  ticker: string;
  price: number;
  change: number;
  chart: ChartData[];
}

interface NewsItem {
  time: string;
  title: string;
  link: string;
}

interface NewsResult {
  list: NewsItem[];
  summary: string;
}

interface Suggestion {
  회사명: string;
  종목코드: string;
}
export default function Home() {
  const [ticker, setTicker] = useState<string>('');
  const [result, setResult] = useState<StockResult | null>(null);
  const [news, setNews] = useState<NewsResult | null>(null); 
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [yRange, setYRange] = useState({ min: 0, max: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatResponse, setChatResponse] = useState<string>('');
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [messages, setMessages] = useState<{sender: 'user' | 'ai', text: string}[]>([]);
  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [newsSummary, setNewsSummary] = useState<string>('');
  // 컴포넌트 내부 상단에 추가
const chartScrollRef = useRef<HTMLDivElement>(null);

// 데이터가 로드될 때마다 오른쪽 끝으로 이동시키는 로직
useLayoutEffect(() => {
  if (chartScrollRef.current) {
    chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
  }
}, [result?.chart]);

// 스크롤 시 범위 업데이트하는 함수
const handleChartScroll = (e: React.UIEvent<HTMLDivElement>) => {
  if (!result) return;
  const container = e.currentTarget;
  const scrollRatio = container.scrollLeft / (container.scrollWidth - container.clientWidth);
  const totalItems = result.chart.length;
  const visibleItems = 30;
  const startIndex = Math.max(0, Math.floor(scrollRatio * (totalItems - visibleItems)));
  const visibleData = result.chart.slice(startIndex, startIndex + visibleItems);
  
  if (visibleData.length > 0) {
    const prices = visibleData.map(c => c.price);
    setYRange({ min: Math.min(...prices), max: Math.max(...prices) });
  }
};

  useEffect(() => {
    const saved = localStorage.getItem('recent');
    if (saved) {
      try { setRecentSearches(JSON.parse(saved)); } catch (e) { console.error(e); }
    }
  }, []);

  

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (selectedIndex >= 0 && suggestions[selectedIndex]) handleAnalyze(suggestions[selectedIndex].회사명);
      else if (suggestions.length > 0) handleAnalyze(suggestions[0].회사명);
    } else if (e.key === 'ArrowDown') setSelectedIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    else if (e.key === 'ArrowUp') setSelectedIndex((prev) => Math.max(prev - 1, 0));
  };

  const handleInputChange = async (val: string) => {
    setTicker(val);
    setSelectedIndex(-1);
    if (val.length > 0) {
      try {
        const res = await fetch(`http://127.0.0.1:8000/search?query=${val}`);
        const data = await res.json();
        setSuggestions(data.suggestions || []);
      } catch (e) { console.error("검색 실패", e); }
    } else {
      setSuggestions([]);
    }
  };

  const chatEndRef = useRef<HTMLDivElement>(null);

// 메시지가 바뀔 때마다 실행되는 효과 추가
useEffect(() => {
  chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
}, [messages]);

const handleAnalyze = async (name: string): Promise<void> => {
  if (isLoading) return;

  setIsLoading(true);
  setTicker(name);
  setMessages([]);
  setSuggestions([]);

  try {
    const [chartRes, newsRes] = await Promise.all([
      fetch(`http://127.0.0.1:8000/analyze?name=${encodeURIComponent(name)}`),
      fetch(`http://127.0.0.1:8000/news?name=${encodeURIComponent(name)}`)
    ]);

    if (!chartRes.ok || !newsRes.ok) throw new Error("데이터 호출 실패");

    // 타입 캐스팅 대신 명확한 결과 받기
    const chartData: StockResult = await chartRes.json();
    const newsData: NewsResult = await newsRes.json();

    setResult(chartData);
    setNewsList(newsData.list);
    setNewsSummary(newsData.summary);
    
    setMessages([{ sender: 'ai', text: newsData.summary }]);

    const updated = [name, ...recentSearches.filter(s => s !== name)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('recent', JSON.stringify(updated));
    
  } catch (e) {
    console.error("분석 실패", e);
  } finally {
    setIsLoading(false);
  }
};
  
  const handleChat = async () => {
    if (!chatInput.trim() || !result) return;
    
    // 1. 사용자 메시지 추가 (모션 트리거를 위해)
    const newUserMessage = { sender: 'user' as const, text: chatInput };
    setMessages(prev => [...prev, newUserMessage]);
    setChatInput('');
    setIsLoadingChat(true);
  
    try {
      const res = await fetch(`http://127.0.0.1:8000/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: result.ticker, question: chatInput }),
      });
      const data = await res.json();
      
      // 2. AI 응답 추가
      setMessages(prev => [...prev, { sender: 'ai', text: data.answer }]);
    } catch (e) {
      console.error("AI 채팅 실패", e);
    } finally {
      setIsLoadingChat(false);
    }
  };

  const removeRecentItem = (itemToRemove: string) => {
    const updated = recentSearches.filter(s => s !== itemToRemove);
    setRecentSearches(updated);
    localStorage.setItem('recent', JSON.stringify(updated));
  };


  const clearRecent = () => {
    setRecentSearches([]);
    localStorage.removeItem('recent');
  };

  return (
    <main className="min-h-screen w-full bg-black text-white p-4 md:p-8 overflow-y-auto">
      <div className="w-full max-w-5xl mx-auto flex flex-col gap-8">
        <header className="text-center pt-10">
          <h1 className="text-7xl font-[800] tracking-tighter text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-purple-500">주식</h1>
        </header>

<div className="w-full z-[100] bg-black/80 backdrop-blur-md py-6 border-b border-white/[0.05]">
  <div className="relative w-full max-w-lg mx-auto">
    <input 
      value={ticker} 
      onChange={(e) => handleInputChange(e.target.value)} 
      onKeyDown={handleKeyDown} 
      className="w-full bg-transparent border-b-2 border-white/20 p-4 text-2xl outline-none focus:border-cyan-400 transition placeholder:text-neutral-700" 
      placeholder="종목 검색..." 
    />
    
    {/* 검색 제안 리스트 */}
    {suggestions.length > 0 && (
      <div className="absolute w-full mt-2 bg-neutral-900 rounded-2xl p-2 border border-white/10 shadow-2xl">
        {suggestions.map((s, idx) => (
          <div 
            key={idx} 
            onClick={() => handleAnalyze(s.회사명)} 
            className={`px-4 py-3 cursor-pointer rounded-xl transition ${idx === selectedIndex ? 'bg-cyan-500/20' : 'hover:bg-cyan-500/10'}`}
          >
            {s.회사명}
          </div>
        ))}
      </div>
    )}

    {/* 검색 기록 */}
    <div className="flex gap-2 justify-center mt-4 flex-wrap items-center">
      <div className="flex gap-2 flex-wrap justify-center">
        {recentSearches.map(s => (
          <div 
            key={s} 
            className="group flex items-center gap-2 px-4 py-1.5 bg-neutral-900 rounded-full border border-white/[0.08] hover:border-cyan-500/30 transition-all duration-300"
          >
            <button 
              onClick={() => handleAnalyze(s)} 
              className="text-[11px] font-medium text-neutral-400 group-hover:text-cyan-400 transition-colors"
            >
              {s}
            </button>
            <button 
              onClick={() => removeRecentItem(s)} 
              className="text-neutral-700 hover:text-red-400 transition-colors"
            >
              <span className="text-[14px] leading-none">×</span>
            </button>
          </div>
        ))}
      </div>

      {recentSearches.length > 0 && (
        <>
          <div className="w-[1px] h-4 bg-white/10 mx-2" />
          <button 
            onClick={clearRecent} 
            className="text-[10px] text-neutral-700 hover:text-neutral-400 uppercase tracking-[0.1em] transition-colors"
          >
            Clear All
          </button>
        </>
      )}
    </div>
  </div>
</div>

        {result && (
  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
    {/* 좌측: 차트 영역 */}
    <div className="lg:col-span-2 bg-[#111111] p-8 rounded-3xl border border-white/[0.05]">
        <div className="mb-8">
          <h2 className="text-[10px] font-bold text-neutral-600 uppercase tracking-[0.2em] mb-2">{result?.ticker}</h2>
          <div className="flex items-center gap-4">
            <span className="text-4xl font-bold tracking-tight text-white">{result?.price.toLocaleString()}</span>
            <span className="text-sm font-semibold text-neutral-500">KRW</span>
            <div className="w-[1px] h-6 bg-white/10" />
            <span className={`text-sm font-bold ${result?.change >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
              {result?.change >= 0 ? '▲' : '▼'} {Math.abs(result?.change)}%
            </span>
          </div>
        </div>

        <div className="flex w-full h-[300px]">
        <div className="w-[60px] h-full flex flex-col justify-between py-[20px] text-[9px] text-neutral-500 border-r border-white/5 pr-2 text-right flex-shrink-0 font-mono">
  <span className="text-neutral-400">
    {yRange.max.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 
    <span className="text-[8px] text-neutral-600"> KRW</span>
  </span>
  <span className="text-neutral-600">
    {Math.round((yRange.max + yRange.min) / 2).toLocaleString('ko-KR', { maximumFractionDigits: 0 })}
  </span>
  <span className="text-neutral-400">
    {yRange.min.toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 
    <span className="text-[8px] text-neutral-600"> KRW</span>
  </span>
</div>

          {/* 스크롤 가능한 차트 */}
          <div 
            ref={chartScrollRef} 
            onScroll={handleChartScroll} 
            className="flex-grow h-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10"
          >
            <div style={{ minWidth: `${Math.max(800, result?.chart.length * 25)}px`, height: '300px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result?.chart} margin={{ top: 20, right: 10, left: 10, bottom: 0 }}>
                  <defs>
                    <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={result?.change >= 0 ? '#ef4444' : '#3b82f6'} stopOpacity={0.2}/>
                      <stop offset="100%" stopColor={result?.change >= 0 ? '#ef4444' : '#3b82f6'} stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#222" />
                  <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} dy={10} />
                  <Tooltip 
  content={({ active, payload }) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-[#1a1a1a] border border-white/10 p-3 rounded-xl shadow-2xl">
          <p className="text-[10px] text-neutral-400 mb-1">{payload[0].payload.date}</p>
          <p className="text-sm font-bold text-white">
            {Number(payload[0].value).toLocaleString('ko-KR', { maximumFractionDigits: 0 })} 
            <span className="text-[10px] text-neutral-500 font-normal"> KRW</span>
          </p>
        </div>
      );
    }
    return null;
  }}
/>
                  <Area 
                    type="monotone" 
                    dataKey="price" 
                    stroke={result?.change >= 0 ? '#ef4444' : '#3b82f6'} 
                    strokeWidth={2}
                    fill="url(#chartGradient)" 
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>
      <div className="bg-[#111111] p-6 rounded-3xl border border-white/[0.1] flex flex-col h-[700px]">
  <h3 className="text-cyan-400 text-[12px] font-bold tracking-[0.1em] mb-6">시장 분석 정보</h3>
  
  {/* 분석 및 뉴스 컨테이너 (스크롤 가능) */}
  <div className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/10 space-y-8">
    
    {/* 1. 관련 뉴스 (가장 위) */}
    {newsList.length > 0 && (
      <div className="space-y-3">
        <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">최신 관련 뉴스</h4>
        {newsList.map((n, idx) => (
          <a key={idx} href={n.link} target="_blank" rel="noreferrer" className="block p-3 rounded-xl bg-[#1a1a1a] hover:bg-[#222] transition-colors border border-white/5">
            <p className="text-[12px] text-white font-medium line-clamp-2">{n.title}</p>
          </a>
        ))}
      </div>
    )}

    {/* 2. 채팅 및 AI 요약 통합 영역 */}
    <div className="space-y-4 pt-4 border-t border-white/5">
      <h4 className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest mb-2">분석 및 대화</h4>
      
      {/* 초기 AI 요약본 */}
      {newsSummary && messages.length === 0 && (
        <div className="bg-white/[0.03] p-4 rounded-xl border border-white/[0.05]">
          <p className="text-[13px] text-neutral-300 leading-relaxed whitespace-pre-line">{newsSummary}</p>
        </div>
      )}

      {/* 대화 기록 */}
      {messages.map((msg, i) => (
        <div key={i} className={`text-[13px] leading-relaxed p-3 rounded-xl ${msg.sender === 'ai' ? 'bg-white/5 text-neutral-200' : 'bg-cyan-500/10 text-cyan-100 ml-8'}`}>
          {msg.text}
        </div>
      ))}
      
      {/* 로딩 표시기 */}
      {isLoadingChat && <div className="text-[12px] text-neutral-600 animate-pulse pl-2">AI가 답변을 생성 중입니다...</div>}
      <div ref={chatEndRef} />
    </div>
  </div>

  {/* 하단 입력창 */}
  <div className="mt-4 pt-4 border-t border-white/[0.05]">
    <input 
      value={chatInput} 
      onChange={(e) => setChatInput(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
      placeholder="전략이나 궁금한 점을 물어보세요..."
      className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3.5 text-[14px] focus:border-cyan-500/50 outline-none transition-all"
    />
  </div>
</div>
  </div>
)}
      </div>
    </main>
  );
}