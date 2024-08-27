# commit-ai

commit-ai는 AI를 사용하여 자동으로 Git 커밋 메시지를 생성하는 CLI 도구입니다.

## 특징

- AI를 활용한 다중 커밋 메시지 제안
- 사용자 지정 가능한 메시지 생성 옵션
- 간편한 CLI 인터페이스

## 설치

npm을 사용하여 전역으로 설치할 수 있습니다:

```
npm install -g @j-ho/commit-ai
```

## 사용 방법

commit-ai을 사용하기 전에 Anthropic API 키를 설정해야 합니다:

```
commit-ai --key YOUR_API_KEY
```

커밋 메시지를 생성하려면 다음과 같이 실행하세요:

```
commit-ai
```

### 옵션

- `-k, --key <key>`: Anthropic API 키 설정
- `-m, --max-tokens <number>`: 메시지 생성을 위한 최대 토큰 수 설정 (기본값: 300)
- `-t, --temperature <number>`: 메시지 생성을 위한 temperature 설정 (기본값: 0.7)
- `-f, --format <format>`: 커밋 메시지 형식 설정 (conventional 또는 freeform, 기본값: conventional)
- `-n, --number <number>`: 생성할 커밋 메시지 제안 수 (기본값: 3)

예시:

```
commit-ai -n 5 -m 400 -t 0.8 -f freeform
```

이 명령은 5개의 자유 형식 커밋 메시지를 생성하며, 최대 400 토큰을 사용하고 temperature를 0.8로 설정합니다.

## 작동 방식

1. 현재 Git 저장소의 스테이징된 변경사항을 분석합니다.
2. AI를 사용하여 여러 개의 커밋 메시지 후보를 생성합니다.
3. 생성된 메시지 목록을 표시합니다.
4. 사용자가 원하는 메시지를 선택하거나 커밋을 취소할 수 있습니다.
5. 선택된 메시지로 Git 커밋을 수행합니다.

## 개발

1. 저장소를 클론합니다.
2. 의존성을 설치합니다: `npm install`
3. 프로젝트를 빌드합니다: `npm run build`
4. 테스트를 실행합니다: `npm test`

## 라이선스

이 프로젝트는 MIT 라이선스를 따릅니다.

## 기여

버그 리포트, 기능 제안, 풀 리퀘스트 등 모든 형태의 기여를 환영합니다. 대규모 변경사항의 경우, 먼저 이슈를 열어 논의해주세요.