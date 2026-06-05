from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import yfinance as yf
import pandas as pd
import requests
from bs4 import BeautifulSoup
from pydantic import BaseModel
import os
from dotenv import load_dotenv
from openai import OpenAI
import math
import numpy as np  # 파일 상단에 추가 (이미 있다면 생략)

load_dotenv()
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "https://stock-ai-22ke.vercel.app",
        "http://localhost:3000" # 로컬 테스트용
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 1. 공통 데이터 로드 및 유틸리티
def load_stock_data():
    url = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13'
    df = pd.read_html(url, header=0, encoding='euc-kr')[0]
    df = df[['회사명', '종목코드']]
    df['종목코드'] = df['종목코드'].astype(str).str.zfill(6)
    return df

stock_df = load_stock_data()

@app.get("/search")
def search_stock(query: str):
    # 회사명에 검색어가 포함된 항목들을 모두 찾음
    matches = stock_df[stock_df['회사명'].str.contains(query, na=False)].copy()
    # 검색어가 회사명과 일치할수록 위로 오게 간단히 정렬
    matches['len'] = matches['회사명'].str.len()
    matches = matches.sort_values(by='len')
    return {"suggestions": matches.to_dict(orient='records')}
# 핵심: 내부 로직용 데이터 수집 함수 (엔드포인트가 아님!)
def get_stock_data_internal(name: str):
    match = stock_df[stock_df['회사명'] == name]
    if match.empty: return None
    code = str(match.iloc[0]['종목코드']).zfill(6)
    for suffix in [".KS", ".KQ"]:
        df = yf.download(f"{code}{suffix}", period="5d", progress=False)
        if not df.empty:
            if isinstance(df.columns, pd.MultiIndex): df.columns = df.columns.get_level_values(0)
            last_price = float(df['Close'].iloc[-1])
            prev_price = float(df['Close'].iloc[-2]) if len(df) > 1 else last_price
            return {"price": last_price, "change": round(((last_price - prev_price) / prev_price) * 100, 2)}
    return None

def get_real_news(name):
    match = stock_df[stock_df['회사명'] == name]
    if match.empty: return []
    code = match.iloc[0]['종목코드']
    url = f"https://finance.naver.com/item/news_news.naver?code={code}&page=1"
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        soup = BeautifulSoup(requests.get(url, headers=headers).content, 'html.parser')
        news_list = []
        for row in soup.select('table.type5 tr'):
            title_tag = row.select_one('.title a')
            date_tag = row.select_one('.date')
            if title_tag and date_tag:
                news_list.append({"time": date_tag.text.strip(), "title": title_tag.text.strip()})
            if len(news_list) >= 5: break
        return news_list
    except: return []

# [수정] AI 응답 함수 내부
def get_ai_response(name, context, avg_price, mode="basic"):
    prompts = {
        "timing": "현재 가격이 저평가 구간인지, 기술적 지표상 지금이 진입하기 좋은 타이밍인지 분석해줘.",
        "growth": "이 종목의 최근 상승 동력은 무엇이며, 추가 상승 여력이 있는지 핵심 뉴스 중심으로 분석해줘.",
        "risk_strategy": "종목의 하락 리스크를 진단하고, 손절선과 목표가를 포함한 현실적인 대응 전략을 짜줘."
    }
    
    system_prompt = f"""
    당신은 월스트리트 출신 퀀트 투자 전략가입니다.
    사용자의 평단가: {avg_price}원을 고려해 분석하세요.
    1. [결론]: '매수 강추 / 매수 고려 / 관망 / 매도' 중 하나를 첫 줄에 배치.
    2. [핵심 데이터]: 제공된 데이터 중 주가 변화, 뉴스 키워드, 지표를 활용해 이유 설명.
    3. [언어]: 일반인이 이해하기 쉬운 용어 사용, 중요한 수치는 **굵게** 표시.
    """
    
    user_prompt = f"종목명: {name}\n\n[데이터]\n{context}\n\n질문: {prompts.get(mode, '종목 상태를 분석해줘.')}"
    
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}]
    )
    return response.choices[0].message.content

# [수정] 실시간 주가 함수: 캐시 방지 추가
def get_stock_data_internal(name: str):
    match = stock_df[stock_df['회사명'] == name]
    if match.empty: return {"price": 0, "change": 0}
    code = str(match.iloc[0]['종목코드']).zfill(6)
    for suffix in [".KS", ".KQ"]:
        hist = yf.Ticker(f"{code}{suffix}").history(period="1d")
        if not hist.empty:
            last = float(hist['Close'].iloc[-1])
            prev = float(hist['Open'].iloc[0])
            return {"price": last, "change": round(((last - prev) / prev) * 100, 2)}
    return {"price": 0, "change": 0}

class ChatRequest(BaseModel):
    name: str
    question: str
    mode: str = "basic"
    avg_price: float = 0.0
    quantity: int = 0  # <--- 이 줄을 추가하세요!
# [삭제/수정] 파일 하단 엔드포인트 부분을 아래로 통째로 교체하세요.


@app.get("/analyze")
def analyze(name: str):
    match = stock_df[stock_df['회사명'] == name]
    if match.empty: raise HTTPException(status_code=404, detail="종목 없음")
    code = str(match.iloc[0]['종목코드']).zfill(6)
    
    # 실시간 시세 데이터 가져오기 (period="1d"로 오늘 데이터만)
    realtime_data = None
    for suffix in [".KS", ".KQ"]:
        ticker = yf.Ticker(f"{code}{suffix}")
        df = ticker.history(period="1d")
        if not df.empty:
            last_price = float(df['Close'].iloc[-1])
            # 전일 종가(previous_close)와 비교하여 실시간 등락 계산
            prev_close = ticker.info.get('previousClose', last_price)
            change = round(((last_price - prev_close) / prev_close) * 100, 2)
            realtime_data = {"price": last_price, "change": change}
            break
            
    # 차트 데이터 (3개월)
    chart_df = yf.download(f"{code}.KS" if ".KS" in str(ticker) else f"{code}.KQ", period="3mo", progress=False)
    if isinstance(chart_df.columns, pd.MultiIndex): chart_df.columns = chart_df.columns.get_level_values(0)
    
    chart = [{"date": str(idx.date()), "price": float(row['Close'])} for idx, row in chart_df.iterrows()]
    
    return {
        "ticker": name, 
        "price": realtime_data['price'], 
        "change": realtime_data['change'], 
        "chart": chart
    }

@app.get("/news")
def get_news(name: str):
    return {"news": get_real_news(name)}

@app.post("/chat")
def chat_with_ai(data: ChatRequest):
    news = get_real_news(data.name)
    stock_info = get_stock_data_internal(data.name)
    market = get_market_indices() # 이미 안전하게 정의된 함수 사용
    
    news_str = "\n".join([f"- {n['title']}" for n in news[:3]])
    context = f"""
    [시장 지표] 코스피: {market.get('KOSPI')}, 코스닥: {market.get('KOSDAQ')}
    [사용자 포트폴리오] 평단가: {data.avg_price}원, 보유수량: {data.quantity}주
    [종목 정보] 현재가: {stock_info.get('price')}원, 등락률: {stock_info.get('change')}%
    [최신 뉴스] {news_str}
    [사용자 질문] {data.question}
    """
    return {"answer": get_ai_response(data.name, context, mode=data.mode, avg_price=data.avg_price)}

# 단일 엔드포인트로 정리 (중복 제거)
# 1. 파일 상단 import 아래에 함수 하나만 정의
@app.get("/indices")
def get_market_indices():
    indices = {"KOSPI": "^KS11", "KOSDAQ": "^KQ11"}
    data = {}
    for name, ticker in indices.items():
        try:
            hist = yf.Ticker(ticker).history(period="5d", timeout=5)
            if not hist.empty and 'Close' in hist:
                val = float(hist['Close'].iloc[-1])
                # NaN 값을 0.0으로 강제 변환
                if math.isnan(val) or val is None:
                    data[name] = 0.0
                else:
                    data[name] = round(val, 2)
            else:
                data[name] = 0.0
        except Exception as e:
            print(f"Error fetching {name}: {e}")
            data[name] = 0.0
    return data
if __name__ == "__main__":
    import uvicorn
    # reload=True를 넣어두면 코드 수정 시 서버가 자동으로 재시작되어 편합니다.
    uvicorn.run(app, host="0.0.0.0", port=8000)