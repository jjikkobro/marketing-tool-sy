# 삼양라운드스퀘어 스타일 가이드라인

출처
- CI 가이드: https://www.roundsquare.ai/group/ci
- 문서 양식 참고: 삼양식품 기업가치 제고계획 IR 자료 (2025.03.26)
- 원본 CI 매뉴얼: [디지털/웹용 RGB](https://www.roundsquare.ai/files/Digital_RGB.pdf) · [인쇄용 PMS](https://www.roundsquare.ai/files/Print_PMS.pdf)

---

## 1. 브랜드 개요

**슬로건 / 소개 문구**
> 삼양라운드스퀘어는 식품과 기술의 무한한 융합으로 더 건강하고 창의적인 미래를 만듭니다.

**CI 모티프 — 네모와 동그라미**
- 레오나르도 다빈치의 「비트루비안 맨」에서 원과 정사각형의 비율을 그대로 심볼에 적용.
- **네모(Square)**: 질서와 혁신, 과학과 연구 → 삼양의 기술력
- **동그라미(Round)**: 포용과 창의성, 가능성과 공감대 → 삼양의 식문화
- **흰 바탕(White Space)**: 무한한 가능성
- 둘의 만남 = 아이디어와 기술이 만나 생기는 새로운 변화

**브랜드 키워드**: 잠재력 · 가능성 · 도전 · 혁신

---

## 2. 컬러

규정 외 색상 사용을 지양하고, 아래 컬러 시스템을 모든 매체에서 일관되게 사용합니다.

### Core Palette

| 이름 | HEX | RGB | CMYK | PMS | 용도 |
|---|---|---|---|---|---|
| **Evolving Orange** | `#FF6400` | 255 / 100 / 0 | 0 / 64 / 100 / 0 | 1505C | 대표 브랜드 컬러, 강조 |
| **Sophisto Charcoal** | `#323232` | 50 / 50 / 50 | 70 / 57 / 63 / 65 | 447C | 본문 텍스트, 다크 배경 |
| **Unlimited White** | `#FFFFFF` | 255 / 255 / 255 | 0 / 0 / 0 / 0 | — | 기본 배경, 여백 |

### Secondary Palette

| 이름 | HEX | RGB | CMYK | PMS | 용도 |
|---|---|---|---|---|---|
| **Burgundy** | `#5F0A32` | 95 / 10 / 50 | 30 / 90 / 50 / 50 | 4074C | 보조 강조, 다크 포인트 |
| **Tangerine** | `#FFA300` | 255 / 163 / 0 | 0 / 50 / 95 / 0 | 137C | 보조 강조, 차트 보조 계열 |
| **Sand** | `#F7DECB` | 247 / 222 / 203 | 0 / 15 / 20 / 0 | 7604C | 서브 배경, 박스/카드 면 |

### 사용 원칙
- 비중: **White > Charcoal > Orange > Secondary** 순. Core 컬러가 주, Secondary는 보조로만 사용 (사이트의 *Proportional Usage* 차트 참고).
- 구 컬러 *Delicious Orange*는 사용하지 않습니다. 반드시 더 밝은 **Evolving Orange `#FF6400`** 사용.
- 디지털은 HEX/RGB, 인쇄는 CMYK/PMS 값을 사용.

### CSS 토큰
```css
:root {
  --sr-orange:   #FF6400; /* Evolving Orange */
  --sr-charcoal: #323232; /* Sophisto Charcoal */
  --sr-white:    #FFFFFF; /* Unlimited White */
  --sr-burgundy: #5F0A32;
  --sr-tangerine:#FFA300;
  --sr-sand:     #F7DECB;
}
```

---

## 3. 로고

### 배경별 사용
공식 로고 사용 배경은 4가지입니다.

| 배경 | 로고 컬러 |
|---|---|
| White | 기본 컬러 로고 |
| Black / Charcoal | 반전(화이트) 로고 |
| Sand | 기본 컬러 로고 |
| Orange | 화이트 로고 |

### 형태
- **Symbol** (네모+동그라미 심볼 단독)
- **Logo** (영문 조합형)
- **Logo – KOR** (국문 조합형)

### 공간규정과 최소크기
- 심볼·로고 주변 상하좌우에 최소 여백(Clearspace)을 확보해 다른 요소의 방해를 받지 않도록 합니다.
- 각 형태별 최소 크기를 준수합니다. (정확한 수치는 원본 CI 매뉴얼 PDF 참조)

### 금지 사항
- 규정 외 색상 적용
- 비율 변형, 회전, 효과(그림자·외곽선 등) 추가
- Clearspace 침범, 최소 크기 미만 축소
- 복잡한 이미지 위 가독성 낮은 배치

---

## 4. 타이포그래피

CI 페이지에 서체 규정이 명시되어 있지 않으므로 아래를 기본값으로 사용합니다. (원본 CI 매뉴얼에 전용 서체가 있으면 그것을 우선)

| 역할 | 서체 | 굵기 |
|---|---|---|
| 국문 | Pretendard (대체: Noto Sans KR) | Regular 400 / Medium 500 / Bold 700 |
| 영문·숫자 | Pretendard (대체: Helvetica Neue) | 동일 |

| 레벨 | 크기 (16:9 슬라이드 1920px 기준) | 굵기 | 컬러 |
|---|---|---|---|
| 페이지 타이틀 | 48–56px | Bold | Charcoal |
| 핵심 메시지(리드) | 32–36px | Bold | Charcoal / Orange 강조 |
| 소제목 | 28px | Bold | Charcoal |
| 본문 | 24px | Regular | Charcoal |
| 주석·단위·출처 | 18–20px | Regular | Charcoal 60% |

- 수치 강조(성장률, 매출 등)는 Bold + Evolving Orange.
- 한 페이지 내 강조색은 Orange 하나로 제한.

---

## 5. 차트·데이터 시각화

| 계열 | 컬러 |
|---|---|
| 주요 계열 (해외, 당해 연도, 핵심 지표) | Evolving Orange `#FF6400` |
| 비교 계열 (내수, 전년도) | Charcoal `#323232` 또는 Sand `#F7DECB` |
| 보조 계열 3번째 이상 | Tangerine `#FFA300` → Burgundy `#5F0A32` |
| 그리드·축 | Charcoal 20% |

- 막대 + 꺾은선 복합 차트: 막대 = 금액(투자금액, 해외매출액), 선 = 비율(ROE, 영업이익률).
- 최신 연도 막대만 Orange, 이전 연도는 Sand/회색으로 처리해 추세 강조.
- 데이터 라벨은 막대 위에 직접 표기, 범례 최소화.
- 주요 이벤트(공장 가동, 법인 설립)는 `▼` 마커 + 짧은 라벨로 타임라인에 표시.

---

## 7. 레이아웃

- 흰 여백(White Space)을 브랜드 요소로 취급 — 넉넉한 여백 유지.
- 기본 배경 White, 섹션 구분·강조 박스는 Sand, 표지·간지는 Orange 또는 Charcoal.
- 네모/동그라미 모티프는 그래픽 요소(번호 배지, 아이콘 프레임, 이미지 마스크)로 절제해 사용.
- 그리드: 16:9 슬라이드 기준 좌우 여백 80–120px, 12컬럼.
