import os
from dotenv import load_dotenv
from openai import OpenAI

# .env 파일에서 API 키를 불러옵니다
load_dotenv()
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# AI에게 질문 던지기
response = client.chat.completions.create(
    model="gpt-4o",
    messages=[
        {"role": "system", "content": "너는 주식 시장을 분석하는 전문 AI 비서야."},
        {"role": "user", "content": "삼성전자 주가가 최근 한 달간 올랐어. 이 현상을 보고 투자자가 주의해야 할 점 3가지만 간단히 말해줘."}
    ]
)
print("--- AI 비서의 답변 ---")
print(response.choices[0].message.content)