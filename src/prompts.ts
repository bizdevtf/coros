/**
 * AI analysis prompts. These turn the raw COROS data tools into guided,
 * coach-style analysis workflows that any MCP client can invoke.
 */

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const COACH_ROLE = `당신은 지구력 스포츠(러닝/사이클/수영) 전문 트레이닝 코치이자 데이터 분석가입니다.
COROS MCP 도구로 실제 데이터를 조회한 뒤 분석하세요. 데이터에 없는 내용은 추측하지 말고 "데이터 없음"으로 표시하세요.
먼저 coros_get_profile로 사용자 프로필(심박존 등)을 확인하면 분석 정확도가 올라갑니다.`;

export function registerPrompts(server: McpServer): void {
  server.registerPrompt(
    "coros_training_analysis",
    {
      title: "COROS 훈련 분석",
      description:
        "최근 N주간의 COROS 활동 데이터를 조회해 훈련량·강도·회복 관점에서 종합 분석하고 다음 주 훈련을 제안합니다.",
      argsSchema: {
        weeks: z.string().optional().describe("분석 기간(주 단위, 기본 4)"),
        focus: z.string().optional().describe("중점 종목/관심사 (예: 러닝, 마라톤 준비, 체중 감량)"),
      },
    },
    ({ weeks, focus }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${COACH_ROLE}

최근 ${weeks ?? "4"}주간의 내 COROS 훈련 데이터를 분석해 주세요.${focus ? ` 중점 사항: ${focus}` : ""}

진행 순서:
1. coros_list_activities로 해당 기간의 모든 활동을 조회 (필요하면 여러 페이지, start_date/end_date는 YYYYMMDD 형식)
2. 주별로 집계: 총 거리, 총 시간, 세션 수, 평균 심박, 트레이닝 로드
3. 대표 세션 2~3개는 coros_get_activity로 상세(랩, 심박 분포)를 확인

보고서에 포함할 내용:
- 주별 훈련량 추이 (표)
- 강도 분포 (심박 기준 easy/moderate/hard 비율) 와 80/20 원칙 대비 평가
- 과훈련/부상 위험 신호 (급격한 볼륨 증가, 회복일 부족 등)
- 잘한 점 3가지, 개선할 점 3가지
- 다음 주 구체적 훈련 계획 제안

한국어로 작성해 주세요.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "coros_weekly_report",
    {
      title: "COROS 주간 리포트",
      description: "이번 주(또는 지난 주) COROS 활동을 요약한 주간 훈련 리포트를 생성합니다.",
      argsSchema: {
        week: z.string().optional().describe("'this' 또는 'last' (기본 this)"),
      },
    },
    ({ week }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${COACH_ROLE}

${week === "last" ? "지난 주" : "이번 주"} COROS 훈련 주간 리포트를 만들어 주세요.

1. coros_list_activities로 해당 주(월~일)의 활동을 조회 (start_date/end_date, YYYYMMDD)
2. 요약: 세션 수, 총 거리, 총 시간, 총 칼로리, 평균 심박
3. 세션별 한 줄 코멘트
4. 지난 주 대비 변화가 보이면 언급 (필요 시 이전 주도 조회)
5. 다음 주를 위한 한 줄 조언

간결한 마크다운 리포트로, 한국어로 작성해 주세요.`,
          },
        },
      ],
    }),
  );

  server.registerPrompt(
    "coros_race_readiness",
    {
      title: "COROS 대회 준비도 평가",
      description: "목표 대회를 앞두고 최근 훈련 데이터를 바탕으로 준비 상태를 평가하고 남은 기간 훈련/테이퍼링을 제안합니다.",
      argsSchema: {
        race_date: z.string().describe("대회 날짜 (YYYY-MM-DD)"),
        race_type: z.string().describe("대회 종류/거리 (예: 하프마라톤, 풀마라톤, 10K, 그란폰도)"),
      },
    },
    ({ race_date, race_type }) => ({
      messages: [
        {
          role: "user" as const,
          content: {
            type: "text" as const,
            text: `${COACH_ROLE}

${race_date}에 ${race_type} 대회에 참가합니다. 내 준비 상태를 평가해 주세요.

1. coros_list_activities로 최근 8주 활동을 조회하고 주별 볼륨/강도를 집계
2. 대회 거리 대비 최장 세션, 목표 페이스 근접 세션을 coros_get_activity로 상세 확인
3. 평가: 유산소 기반, 대회 특이적 훈련, 최근 컨디션(심박 추세)
4. 준비도 점수(10점 만점)와 근거
5. 대회까지 남은 기간의 주차별 훈련 계획 + 테이퍼링 전략
6. 데이터 기반 예상 완주 목표(공격적/현실적/안전 3단계)

한국어로 작성해 주세요.`,
          },
        },
      ],
    }),
  );
}
