# Focus Gauge Plugin

Obsidian 플러그인으로, Daily Note에서 시간 블록을 자동으로 관리하고 집중도/작업량을 게이지로 시각화합니다.

---

## 주요 기능

### 1. 시간 블록 자동 정리 (Now / Time Blocks)

Daily Note를 열거나 Obsidian 창에 포커스가 돌아올 때, `## 📊 Now` 섹션과 `## 🕒 Time Blocks` 섹션 사이에서 시간 블록을 자동으로 재배치합니다.

```
## 📊 Now
- 9       ← 이전 시간
- 10      ← 현재 시간
- 11      ← 다음 시간

---
## 🕒 Time Blocks
- 0
- 1
...
- 8
- 12
...
```

**오늘 Daily Note를 열 때**

- 현재 시각 기준으로 이전 시간 / 현재 시간 / 다음 시간에 해당하는 블록이 `Now` 섹션으로 이동합니다.
- 나머지 시간 블록은 `Time Blocks` 섹션으로 아카이브됩니다.
- 현재 시간 블록이 없으면 `Now` 섹션에 자동 생성됩니다 (설정에서 비활성화 가능).
- 각 시간 블록의 하위 항목(들여쓰기된 내용)도 함께 이동합니다.

**다른 날 Daily Note를 열 때**

- `Now` 섹션의 블록이 모두 `Time Blocks` 섹션으로 이동합니다.
- `Now` 섹션에는 dataviewjs 통계 블록만 남습니다.

**트리거**

- `file-open` 이벤트 (파일 열기)
- `window.focus` 이벤트 (창 포커스 복귀)
- 300ms 딜레이 후 실행 (에디터 렌더링 완료 대기)

---

### 2. Focus Gauge 시각화

`[타입 숫자]` 형식의 마크업을 인라인 게이지 위젯으로 렌더링합니다.

**기본 문법** (설정에서 변경 가능)

```
[C 8]   ← Concentration 8/10
[W 6]   ← Work 6/10
[L 5]   ← Learning 5/10
[R 3]   ← Rest 3/10
```

- Live Preview(편집 모드)와 Reading View(읽기 모드) 모두 지원합니다.
- 커서가 마크업 위에 있을 때는 원문이 표시됩니다.
- 파일 전체에서 렌더링됩니다 (헤더 제한 없음).

---

## 시간 블록 형식

```markdown
- 10
  - [C 8] 기능 개발
  - [W 6] 코드 리뷰
```

- `- <숫자>` 형식으로 시간(0~23)을 나타냅니다. 분 단위는 없습니다.
- 하위 항목은 들여쓰기로 구분하며, 게이지 마크업과 함께 사용합니다.

---

## 설정

| 설정 | 기본값 | 설명 |
|------|--------|------|
| Now 헤더 | `## 📊 Now` | 현재 시간대 블록이 위치하는 섹션 헤더 |
| Time Blocks 헤더 | `## 🕒 Time Blocks` | 아카이브 블록이 위치하는 섹션 헤더 |
| 자동 시간 블록 정리 | ON | 파일 열기/포커스 시 자동 재배치 여부 |
| 현재 시간 블록 자동 생성 | ON | 현재 시간 블록이 없을 때 자동 생성 여부 |
| 시작/끝 문자 | `[` / `]` | 게이지 마크업의 구분자 |
| 구분자 | 공백 | 타입과 숫자 사이 구분자 |
| Gauge Types | C, W, L, R | 게이지 타입(라벨, 이름, 색상) |

---

## 명령어

| 명령어 | 설명 |
|--------|------|
| 시간 블록 정리 (Now / Time Blocks 분류) | 수동으로 시간 블록을 재배치 |

---

## Daily Note 템플릿 예시

```markdown
## 📊 Now
```dataviewjs
const path = dv.current().file.path;
const text = await dv.io.load(path) ?? "";

const count = (key) =>
  (text.match(new RegExp(`\(${key}\s\d+\)`, "g")) || []).length;

dv.table(
  ["🟦 C", "🟩 L", "🟨 R", "🟥 W"],
  [[count("C") + count("c"), count("L") + count("l"), count("R") + count("r"), count("W") + count("w")]]
);
` ``
---
## 🕒 Time Blocks
```

`Now` 섹션의 dataviewjs 블록은 플러그인이 이동하지 않으며 항상 유지됩니다.
