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

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# 1. 데이터 로드
def load_stock_data():
    url = 'http://kind.krx.co.kr/corpgeneral/corpList.do?method=download&searchType=13'
    df = pd.read_html(url, header=0, encoding='euc-kr')[0]
    df = df[['회사명', '종목코드']]
    df['종목코드'] = df['종목코드'].astype(str).str.zfill(6)
    return df

stock_df = load_stock_data()

# 2. AI 분석 엔진 (핵심: 전문 전략가 페르소나 적용)
def get_ai_response(name, context):
    system_prompt = """
    당신은 10년 차 월스트리트 전문 투자 전략가입니다.
    답변은 반드시 다음 형식을 지키세요:
    
    1. **[핵심 요약]**: 현재 상황을 1~2줄로 요약.
    2. **[상세 분석]**: 뉴스 데이터와 주가를 연계하여 분석 (• 불렛 포인트 활용).
    3. **[투자 의견]**: 매수/매도/보류 여부를 논리적 근거와 함께 제시 (리스크 포함).
    
    규칙: 
    - 수치는 반드시 **굵게** 표시하세요.
    - 문단 사이를 개행하여 시각적으로 읽기 편하게 만드세요.
    """
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"종목: {name}\n\n데이터 및 질문:\n{context}"}
        ]
    )
    return response.choices[0].message.content

# 3. API 엔드포인트
@app.get("/search")
def search(query: str):
    results = stock_df[stock_df['회사명'].str.contains(query, na=False)].head(10)
    return {"suggestions": results.to_dict(orient='records')}

@app.get("/analyze")
def analyze(name: str):
    match = stock_df[stock_df['회사명'] == name]
    if match.empty: 
        raise HTTPException(status_code=404, detail="종목 없음")
    
    code = match.iloc[0]['종목코드']
    formatted_code = str(code).zfill(6)
    
    df = pd.DataFrame()
    
    # 3개월(약 90일) 데이터로 설정하여 데이터 안정성 확보
    for suffix in [".KS", ".KQ"]:
        ticker_symbol = f"{formatted_code}{suffix}"
        # period="3mo"로 설정하여 최근 데이터 위주로 깔끔하게 확보
        temp_df = yf.download(ticker_symbol, period="3mo", progress=False)
        
        if not temp_df.empty:
            if isinstance(temp_df.columns, pd.MultiIndex):
                temp_df.columns = temp_df.columns.get_level_values(0)
            
            if 'Close' in temp_df.columns:
                # 결측치 제거
                df = temp_df[['Close']].dropna()
                if not df.empty:
                    break
    
    if df.empty or len(df) < 2:
        raise HTTPException(status_code=404, detail="차트 데이터를 불러올 수 없습니다.")

    # 차트 데이터 가공
    chart_data = []
    for idx, row in df.iterrows():
        date_str = idx.strftime('%Y-%m-%d') if hasattr(idx, 'strftime') else str(idx)
        chart_data.append({"date": date_str, "price": float(row['Close'])})
    
    last_price = float(df['Close'].iloc[-1])
    prev_price = float(df['Close'].iloc[-2])
    change_rate = round(((last_price - prev_price) / prev_price) * 100, 2)
    
    return {
        "ticker": name, 
        "price": last_price, 
        "change": change_rate, 
        "chart": chart_data
    }

def get_real_news(name):

    try:
        # 1. 종목코드 조회
        match = stock_df[stock_df['회사명'] == name]
        if match.empty:
            return []
        
        code = match.iloc[0]['종목코드']
        
        # 2. 뉴스 페이지 요청
        url = f"https://finance.naver.com/item/news_news.naver?code={code}&page=1"
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
        
        response = requests.get(url, headers=headers)
        response.raise_for_status() # 요청 실패 시 예외 발생
        
        # 3. 데이터 파싱
        soup = BeautifulSoup(response.content, 'html.parser')
        news_list = []
        
        # 네이버 금융 뉴스 테이블 행(.type5 tr) 순회
        for row in soup.select('table.type5 tr'):
            title_tag = row.select_one('.title a')
            date_tag = row.select_one('.date')
            
            if title_tag and date_tag:
                news_list.append({
                    "time": date_tag.text.strip(),
                    "title": title_tag.text.strip(),
                    "link": "https://finance.naver.com" + title_tag['href'] # 여기서 'link'라는 이름으로 보냅니다.
})
            
            # 5개만 수집 후 종료
            if len(news_list) >= 5:
                break
                
        return news_list

    except Exception as e:
        print(f"뉴스 수집 에러: {e}")
        return []


def get_ai_response(name, context):
    system_prompt = """
    당신은 10년 차 월스트리트 전문 투자 전략가입니다.
    답변은 반드시 다음 형식을 지키세요:
    
    1. **[핵심 요약]**: 현재 상황을 1~2줄로 요약.
    2. **[상세 분석]**: 뉴스 데이터와 주가를 연계하여 분석 (• 불렛 포인트 활용).
    3. **[투자 의견]**: 매수/매도/보류 여부를 논리적 근거와 함께 제시 (리스크 포함).
    
    규칙: 
    - 수치는 반드시 **굵게** 표시하세요.
    - 문단 사이를 개행하여 시각적으로 읽기 편하게 만드세요.
    """
    response = client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"종목: {name}\n\n데이터 및 질문:\n{context}"}
        ]
    )
    return response.choices[0].message.content

@app.get("/news")
def get_news(name: str):
    news_list = get_real_news(name)
    news_titles = "\n".join([f"- {n['title']}" for n in news_list[:3]])
    summary = get_ai_response(name, f"뉴스 요약 요청:\n{news_titles}")
    return {"list": news_list, "summary": summary}

class ChatRequest(BaseModel):
    name: str
    question: str

@app.post("/chat")
def chat_with_ai(data: ChatRequest):
    news = get_real_news(data.name)
    stock_info = analyze(data.name)
    
    news_context = "\n".join([f"- {n['title']}" for n in news[:3]])
    context = f"현재가: {stock_info['price']}원\n뉴스:\n{news_context}\n\n질문: {data.question}"
    
    answer = get_ai_response(data.name, context)
    return {"answer": answer}

# 파일 맨 마지막에 추가
if __name__ == "__main__":
    import uvicorn
    # 환경 변수 PORT를 읽어오고, 없으면 8000번 사용
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)