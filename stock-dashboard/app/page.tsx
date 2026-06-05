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

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';

export default function Home() {
  const [ticker, setTicker] = useState<string>('');
  const [result, setResult] = useState<StockResult | null>(null);

  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [yRange, setYRange] = useState({ min: 0, max: 0 });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [chatInput, setChatInput] = useState<string>('');
  const [chatResponse, setChatResponse] = useState<string>('');
  const [isLoadingChat, setIsLoadingChat] = useState<boolean>(false);
  const [messages, setMessages] = useState<{sender: 'user' | 'ai', text: string}[]>([]);
  const [portfolio, setPortfolio] = useState({ avgPrice: 0, quantity: 0 });
  const [indices, setIndices] = useState({ KOSPI: 0, KOSDAQ: 0 });
  // 컴포넌트 내부 상단에 추가
const chartScrollRef = useRef<HTMLDivElement>(null);
const chatContainerRef = useRef<HTMLDivElement>(null);

// 데이터가 로드될 때마다 오른쪽 끝으로 이동시키는 로직
useLayoutEffect(() => {
  if (chartScrollRef.current) {
    chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
  }
}, [result?.chart]);

// 기존의 useEffect를 삭제하고 아래 코드로 교체
useLayoutEffect(() => {
  if (messages.length === 0) {
    // 종목 변경 시 강제로 최상단 이동
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = 0;
    }
  } else {
    // 메시지 추가 시에만 부드럽게 하단으로
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }
}, [messages]);

const saveRecentSearch = (name: string) => {
  setRecentSearches(prev => {
    const updated = [name, ...prev.filter(s => s !== name)].slice(0, 5);
    localStorage.setItem('recent', JSON.stringify(updated));
    return updated;
  });
};


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
      try {
        const parsed = JSON.parse(saved);
        setTimeout(() => setRecentSearches(parsed), 0); // Defer state update
      } catch (e) {
        console.error(e);
      }
    }
  }, []);

  useEffect(() => {
    const updateData = async () => {
      try {
        // 1. 지수 갱신 (서버 응답을 기다리고 확인)
        const resIdx = await fetch(`${API_BASE_URL}/indices`);
        if (resIdx.ok) {
          const dataIdx = await resIdx.json();
          if (dataIdx && typeof dataIdx === 'object') {
            setIndices(dataIdx);
          }
        }
  
        // 2. 종목 주가 갱신
        if (ticker) {
          const resStock = await fetch(`${API_BASE_URL}/analyze?name=${encodeURIComponent(ticker)}`);
          if (resStock.ok) {
            const dataStock = await resStock.json();
            setResult(dataStock);
          }
        }
      } catch (e) {
        console.error("실시간 데이터 갱신 에러:", e);
      }
    };
  
    updateData();
    const interval = setInterval(updateData, 5000);
    return () => clearInterval(interval);
  }, [ticker]);

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
        const res = await fetch(`${API_BASE_URL}/search?query=${val}`);
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

  // 1. 데이터 호출 성공 여부와 상관없이 무조건 기록 남기기
  const updated = [name, ...recentSearches.filter(s => s !== name)].slice(0, 5);
  setRecentSearches(updated);
  localStorage.setItem('recent', JSON.stringify(updated));

  try {
    const [chartRes, newsRes] = await Promise.all([
      fetch(`${API_BASE_URL}/analyze?name=${encodeURIComponent(name)}`),
      fetch(`${API_BASE_URL}/news?name=${encodeURIComponent(name)}`)
    ]);

    // 2. 여기서 던지는 에러를 잡기 위해 수정
    if (!chartRes.ok) {
        console.error("서버 응답 오류:", chartRes.status);
        alert(`데이터를 찾을 수 없습니다 (상태코드: ${chartRes.status})`);
        return; // 에러 발생 시 여기서 함수 종료 (throw 대신 return)
    }

    const chartData: StockResult = await chartRes.json();
    setResult(chartData); 
    
  } catch (e) {
    console.error("분석 실패", e);
  } finally {
    setIsLoading(false);
  }
};
  
const handleChat = async (message?: string, mode: string = "basic") => {
  const input = message || chatInput;
  if (!input.trim() || !result) return;
  
  // 1. 내가 입력한 질문을 채팅창에 즉시 추가 (필수!)
  setMessages(prev => [...prev, { sender: 'user', text: input }]);
  
  // 2. 입력창 초기화 (직접 입력한 경우에만)
  if (!message) {
    setChatInput("");
  }

  setIsLoadingChat(true);
  try {
    const url = `${API_BASE_URL}/chat`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        name: result.ticker, 
        question: input,
        mode: mode,
        avg_price: portfolio.avgPrice 
      }),
    });
    
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`서버 응답 오류: ${res.status} - ${errorText}`);
    }
    
    const data = await res.json();
    // 3. AI 응답 추가
    setMessages(prev => [...prev, { sender: 'ai', text: data.answer }]);
  } catch (e) {
    console.error("AI 채팅 실패 상세 내용:", e);
    setMessages(prev => [...prev, { sender: 'ai', text: "연결 오류입니다. 서버를 확인해주세요." }]);
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
      <header className="sticky top-0 z-[50] flex justify-between items-center border-b border-gray-800 pb-4 mb-8">
  {/* 이모지 + 타이틀 */}
  <div className="flex items-center gap-2">
    <span className="text-2xl">🔎</span>
    <h1 className="text-xl font-bold text-white tracking-tight">주식</h1>
  </div>
  
  {/* 지수 정보 */}
  <div className="flex gap-6 text-sm">
    <div className="flex items-center gap-2">
      <span className="text-gray-500">KOSPI</span>
      <span className="text-cyan-400 font-mono font-bold">{indices.KOSPI}</span>
    </div>
    <div className="flex items-center gap-2">
      <span className="text-gray-500">KOSDAQ</span>
      <span className="text-purple-400 font-mono font-bold">{indices.KOSDAQ}</span>
    </div>
  </div>
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
    
    {suggestions.length > 0 && (
  <div className="absolute w-full mt-2 bg-neutral-900 rounded-2xl p-2 border border-white/10 shadow-2xl z-[9999] max-h-[300px] overflow-y-auto scrollbar-thin">
    {suggestions.map((s, idx) => (
      <div 
        key={idx} 
        onClick={() => handleAnalyze(s.회사명)} 
        className={`px-4 py-3 cursor-pointer rounded-xl transition ${idx === selectedIndex ? 'bg-cyan-500/20 text-cyan-400' : 'hover:bg-neutral-800'}`}
      >
        <span className="font-bold">{s.회사명}</span>
        <span className="text-neutral-500 text-[10px] ml-2">{s.종목코드}</span>
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
            className="text-[12px] text-neutral-300 hover:text-neutral-400 uppercase tracking-[0.1em] transition-colors"
          >
            검색 기록 삭제
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
          <h2 className=" font-bold text-neutral-300 uppercase tracking-[0.2em] mb-2">{result?.ticker}</h2>
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

      <div className="bg-[#111111] p-6 rounded-3xl border border-white/[0.08] flex flex-col h-[750px] shadow-2xl">
  {/* 헤더 */}
  <div className="flex justify-between items-start mb-6">
    <div>
      <h2 className="text-white text-xl font-bold">{ticker}</h2>
      <p className="text-cyan-400 text-[10px] font-bold tracking-[0.2em] mt-1">QUANT ANALYSIS</p>
    </div>
    <div className="text-right">
      <div className="text-white text-lg font-mono font-bold">{result?.price.toLocaleString()}원</div>
      <div className={`text-[12px] font-bold ${result?.change >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
        {result?.change >= 0 ? '+' : ''}{result?.change}%
      </div>
      <button onClick={() => handleAnalyze(ticker)} className="text-[10px] text-white/30 hover:text-cyan-400 mt-1 transition-colors">데이터 초기화 ↻</button>
    </div>
  </div>

  {ticker && (
    <div className="flex flex-col flex-grow min-h-0">
      {/* 채팅창: 슬림한 메시지 UI */}
      <div ref={chatContainerRef} className="flex-grow overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-white/5 space-y-6 pb-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.sender === 'ai' ? 'justify-start' : 'justify-end'}`}>
            <div className={`max-w-[70%] text-[13px] leading-relaxed p-4 rounded-xl border ${
              msg.sender === 'ai' 
                ? 'bg-[#111111] text-neutral-300 border-white/[0.05]' 
                : 'bg-cyan-500/10 text-cyan-100 border-cyan-500/30' // 슬림하고 색상 통일
            }`}>
              <div className="whitespace-pre-wrap">{msg.text}</div>
            </div>
          </div>
        ))}
        {/* 로딩 인디케이터: AI가 답변 생성 중일 때만 표시 */}
  {isLoadingChat && (
    <div className="flex justify-start animate-pulse">
      <div className="bg-[#111111] text-cyan-400 text-[11px] px-4 py-2 rounded-xl border border-cyan-500/20">
        생각 중...
      </div>
    </div>
  )}
        <div ref={chatEndRef} />
      </div>

      {/* 평단가 입력부 */}
      <div className="flex gap-2 mb-3 pt-4 border-t border-white/[0.05]">
        <input 
          type="number" 
          value={portfolio.avgPrice || ''}
          placeholder="평단가 입력" 
          className="flex-grow bg-[#050505] border border-white/10 rounded-lg px-3 py-2 text-[12px] text-white outline-none focus:border-cyan-500 [appearance:textfield]"
          onChange={(e) => setPortfolio({...portfolio, avgPrice: Number(e.target.value)})}
        />
        <button onClick={() => setPortfolio({...portfolio, avgPrice: result?.price || 0})} className="px-4 border border-cyan-500/50 text-[11px] text-cyan-400 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 hover:text-white transition-all font-bold">현재가 적용</button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 pb-3">
  {[
    { label: "매수 전략", q: "현재가 기준 매수 적정성 분석해줘. 손절라인과 목표수익률을 수치로 제시해.", m: "timing" },
    { label: "매도 전략", q: "내 평단가와 비교해서 현재 익절/손절 전략을 세워줘. 매도 타이밍은 언제로 봐?", m: "exit" },
    { label: "뉴스/이슈", q: "최신 뉴스 3개를 요약하고, 이게 주가 변동성에 미칠 영향을 분석해줘.", m: "news" },
    { label: "기술 지표", q: "RSI, 이동평균선 등 기술적 지표를 기반으로 단기 추세를 분석해줘.", m: "tech" },
    { label: "적정 주가", q: "현재 기업 가치와 재무지표를 감안한 적정 주가를 추정해줘.", m: "price" },
    { label: "위험 요인", q: "현재 이 종목의 잠재적 리스크(매출, 업황 등)를 3가지 짚어줘.", m: "finance" }
  ].map((btn) => (
    <button 
      key={btn.label} 
      onClick={() => {
        setMessages(prev => [...prev, { text: btn.label, sender: 'user' }]); 
        handleChat(btn.q, btn.m); 
      }} 
      className="py-2 rounded-lg border border-white/10 text-white/50 text-[11px] hover:border-cyan-500/50 hover:bg-cyan-500/10 hover:text-cyan-400 transition-all"
    >
      {btn.label}
    </button>
  ))}
</div>

{/* 전송 버튼이 포함된 입력창 영역 */}
<div className="relative flex items-center w-full mt-2">
  <input 
    value={chatInput} 
    onChange={(e) => setChatInput(e.target.value)}
    onKeyDown={(e) => { if (e.key === 'Enter') handleChat(); }}
    placeholder="직접 질문하기..."
    className="w-full bg-[#050505] border border-white/10 rounded-xl px-4 py-3 pr-12 text-[13px] text-white outline-none focus:border-cyan-500"
    style={{ fontSize: '16px' }} // 모바일 확대 방지
  />
  
  {/* 전송 버튼 */}
  <button 
    onClick={() => handleChat()}
    className="absolute right-2 p-2 text-cyan-400 hover:text-white transition-colors"
    aria-label="전송"
  >
    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
      <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.429a1 1 0 001.169-1.409l-7-14z" />
    </svg>
  </button>
</div>
    </div>
  )}
</div>
  </div>
)}
      </div>
    </main>
  );
}