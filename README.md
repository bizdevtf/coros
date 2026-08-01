# COROS MCP Server

COROS 트레이닝 허브(Training Hub) 데이터를 MCP(Model Context Protocol)로 연결해, Claude 등 AI가 내 운동 데이터를 직접 조회하고 **훈련 분석·주간 리포트·대회 준비도 평가**를 수행할 수 있게 해주는 서버입니다.

> ⚠️ COROS는 공식 공개 API를 제공하지 않습니다. 이 서버는 training.coros.com 웹앱이 사용하는 **비공식 API**(teamapi.coros.com)를 사용하며, COROS 측 변경에 따라 동작이 달라질 수 있습니다. 개인 계정 데이터 조회 용도로만 사용하세요.

## 기능

### 도구 (Tools)

| 도구 | 설명 |
|------|------|
| `coros_list_activities` | 활동(운동) 목록 조회 — 페이지네이션, 종목/날짜 필터 지원 |
| `coros_get_activity` | 활동 상세 조회 — 랩/스플릿, 심박, 페이스, 고도 등 |
| `coros_download_activity` | 활동 파일(FIT/TCX/GPX/KML/CSV) 다운로드 URL 발급 |
| `coros_get_profile` | 계정 프로필 조회 — 심박존, 신체 정보 등 |
| `coros_api_request` | 임의의 COROS API 엔드포인트 호출 (수면·일일 데이터 등 탐색용) |
| `body_load_measurements` | 스마트 체중계(앳플리 등) 체성분 CSV 로드 — 훈련 데이터와 교차 분석용 |

### AI 분석 프롬프트 (Prompts)

| 프롬프트 | 설명 |
|----------|------|
| `coros_training_analysis` | 최근 N주 훈련량·강도 분포·과훈련 위험 종합 분석 + 다음 주 계획 제안 |
| `coros_weekly_report` | 이번 주/지난 주 훈련 주간 리포트 |
| `coros_race_readiness` | 목표 대회 준비도 평가 + 테이퍼링 전략 |
| `coros_body_training_analysis` | 체성분(체중계 CSV) × 훈련 데이터 교차 분석 |

## 설치

```bash
git clone https://github.com/bizdevtf/coros.git
cd coros
npm install
npm run build
```

## 환경 변수

| 변수 | 필수 | 설명 |
|------|------|------|
| `COROS_EMAIL` | ✅ | COROS 계정 이메일 |
| `COROS_PASSWORD` | ✅* | COROS 계정 비밀번호 (평문) |
| `COROS_PASSWORD_MD5` | ✅* | 비밀번호의 MD5 해시(32자리 hex). 설정 시 `COROS_PASSWORD`보다 우선하며, **평문 비밀번호를 어디에도 저장하지 않아도 됩니다** |
| `COROS_REGION` | | `global`(기본) / `eu` / `cn` |
| `COROS_API_BASE` | | API 베이스 URL 직접 지정 (REGION보다 우선) |

\* 둘 중 하나만 설정하면 됩니다. 보안상 `COROS_PASSWORD_MD5` 권장.

### MD5 해시 만들기

COROS API는 로그인 시 비밀번호를 MD5 해시로 전송하므로, 해시만 있으면 로그인할 수 있습니다. 본인 PC에서:

```bash
# macOS
md5 -s '비밀번호'
# Linux
echo -n '비밀번호' | md5sum
# Windows PowerShell
[BitConverter]::ToString([Security.Cryptography.MD5]::Create().ComputeHash([Text.Encoding]::UTF8.GetBytes('비밀번호'))).Replace('-','').ToLower()
```

> 참고: 이 해시로도 COROS API 로그인은 가능하므로 비밀번호만큼은 아니어도 여전히 민감 정보입니다. 다만 평문이 노출되지 않으므로, 같은 비밀번호를 다른 서비스에서도 쓰는 경우 피해 범위를 COROS 계정으로 한정할 수 있습니다.

## Claude에 연결하기

### Claude Code (CLI)

```bash
claude mcp add coros \
  -e COROS_EMAIL=you@example.com \
  -e COROS_PASSWORD=yourpassword \
  -- node /절대/경로/coros/dist/index.js
```

### Claude Desktop

`claude_desktop_config.json`에 추가:

```json
{
  "mcpServers": {
    "coros": {
      "command": "node",
      "args": ["/절대/경로/coros/dist/index.js"],
      "env": {
        "COROS_EMAIL": "you@example.com",
        "COROS_PASSWORD": "yourpassword"
      }
    }
  }
}
```

## 사용 예시

연결 후 Claude에게 이렇게 물어보세요:

- "최근 4주 훈련 분석해줘" (또는 `coros_training_analysis` 프롬프트 실행)
- "이번 주 러닝 총 몇 km 뛰었어?"
- "다음 달 하프마라톤 나가는데 준비 상태 평가해줘"
- "지난 일요일 장거리 러닝 심박 분포 분석해줘"

## 개발

```bash
npm run dev        # tsx watch 모드
npm run build      # dist/ 빌드
npx @modelcontextprotocol/inspector node dist/index.js   # MCP Inspector로 테스트
```

## 스마트 체중계(앳플리 등) 데이터 연결

앳플리(atFlee)를 비롯한 대부분의 스마트 체중계는 공개 API가 없으므로 **CSV 내보내기 → 파일 로드** 방식으로 연결합니다:

1. 데이터 내보내기 (아래 중 가능한 경로 사용):
   - 앳플리 앱의 데이터 내보내기/공유 기능
   - 삼성헬스 → 설정 → 개인 데이터 다운로드 (weight CSV 포함)
   - 직접 기록한 엑셀/CSV (날짜 + 체중 등의 열만 있으면 됨)
2. Claude에게 파일 경로와 함께 요청: "이 체중 데이터랑 내 훈련 데이터 교차 분석해줘" (또는 `coros_body_training_analysis` 프롬프트 사용)

`body_load_measurements` 도구가 한국어/영어 열 이름을 자동 인식합니다 (체중/weight, 체지방률/body_fat, 골격근량/skeletal_muscle, BMI, 체수분, 내장지방, 기초대사량 등). 삼성헬스 내보내기 파일의 메타데이터 줄도 자동으로 건너뜁니다.

## 주의사항

- 비밀번호는 로그인 시 MD5 해시로 전송되며(웹앱과 동일 방식), 서버 프로세스 환경변수로만 보관됩니다. 설정 파일 권한에 유의하세요.
- 토큰 만료 시 자동으로 재로그인 후 1회 재시도합니다.
- 비공식 API 특성상 응답 필드명이 예고 없이 바뀔 수 있습니다. 문제가 생기면 `coros_api_request`로 응답 구조를 직접 확인해 보세요.
