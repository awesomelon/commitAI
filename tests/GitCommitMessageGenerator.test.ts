import {
  GitCommitMessageGenerator,
  SUPPORTED_LANGUAGES,
} from "../src/GitCommitMessageGenerator";
import { Anthropic } from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import fs from "fs";
import { COMMIT_MESSAGE_TEMPLATE } from "../src/commitMessageTemplate";

jest.mock("@anthropic-ai/sdk");
jest.mock("child_process");
jest.mock("fs");
jest.mock("os");
jest.mock("path", () => ({
  resolve: jest.fn(),
}));

describe("GitCommitMessageGenerator", () => {
  const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;
  const mockedReadFileSync = fs.readFileSync as jest.MockedFunction<
    typeof fs.readFileSync
  >;
  let generator: GitCommitMessageGenerator;
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    generator = new GitCommitMessageGenerator("fake-api-key");
    jest.clearAllMocks();
    consoleWarnSpy = jest.spyOn(console, "warn").mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe("Constructor and Options", () => {
    describe("Language Validation", () => {
      test("accepts all supported languages", () => {
        SUPPORTED_LANGUAGES.forEach((lang) => {
          const gen = new GitCommitMessageGenerator("fake-api-key", {
            language: lang,
          });
          expect((gen as any).options.language).toBe(lang);
          expect(consoleWarnSpy).not.toHaveBeenCalled();
        });
      });

      test("falls back to English for unsupported languages with warning", () => {
        const invalidLang = "invalid-lang";
        const gen = new GitCommitMessageGenerator("fake-api-key", {
          language: invalidLang,
        });

        expect((gen as any).options.language).toBe("en");
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          `Language "${invalidLang}" is not supported. Falling back to English (en).`,
        );
      });

      test("handles case-sensitive language codes", () => {
        const gen = new GitCommitMessageGenerator("fake-api-key", {
          language: "KO",
        });

        expect((gen as any).options.language).toBe("en");
        expect(consoleWarnSpy).toHaveBeenCalledWith(
          'Language "KO" is not supported. Falling back to English (en).',
        );
      });
    });
  });

  describe("API Interaction with Language", () => {
    test("includes language-specific instructions in API call", async () => {
      const mockCreate = jest
        .fn()
        .mockResolvedValue({ content: [{ text: "API Response" }] });
      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
        () => ({ messages: { create: mockCreate } }) as any,
      );

      const koreanGen = new GitCommitMessageGenerator("fake-api-key", {
        language: "ko",
      });
      await (koreanGen as any).callClaudeAPI("Test diff");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining(
                "Write both the title and body in Korean",
              ),
            }),
          ],
        }),
      );
    });

    test("uses English instructions for fallback cases", async () => {
      const mockCreate = jest
        .fn()
        .mockResolvedValue({ content: [{ text: "API Response" }] });
      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
        () => ({ messages: { create: mockCreate } }) as any,
      );

      const gen = new GitCommitMessageGenerator("fake-api-key", {
        language: "invalid-lang",
      });
      await (gen as any).callClaudeAPI("Test diff");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining(
                "Write the commit message in English",
              ),
            }),
          ],
        }),
      );
    });
  });

  describe("Commit Message Generation", () => {
    test("callClaudeAPI includes language-specific template in the prompt", async () => {
      const mockCreate = jest
        .fn()
        .mockResolvedValue({ content: [{ text: "API Response" }] });
      (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
        () => ({ messages: { create: mockCreate } }) as any,
      );

      // 한국어 설정으로 생성기 인스턴스 생성
      const koreanGenerator = new GitCommitMessageGenerator("fake-api-key", {
        language: "ko",
      });
      await (koreanGenerator as any).callClaudeAPI("Test diff");

      expect(mockCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          messages: [
            expect.objectContaining({
              content: expect.stringContaining(COMMIT_MESSAGE_TEMPLATE("ko")),
            }),
          ],
        }),
      );
    });

    test("generates commit messages in specified language", async () => {
      const mockDiff = "mock diff";
      const mockResponse = {
        content: [
          {
            text: '1. "feat: 사용자 인증 추가"\n사용자 인증 기능 구현:\n- 로그인/로그아웃 기능\n- JWT 세션 관리',
          },
        ],
      };

      const koreanGenerator = new GitCommitMessageGenerator("fake-api-key", {
        language: "ko",
      });
      (koreanGenerator as any).getGitDiff = jest.fn().mockReturnValue(mockDiff);
      (koreanGenerator as any).callClaudeAPI = jest
        .fn()
        .mockResolvedValue(mockResponse);

      const messages = await koreanGenerator.generateCommitMessages();

      expect(messages).toEqual([
        {
          title: "feat: 사용자 인증 추가",
          body: "사용자 인증 기능 구현:\n- 로그인/로그아웃 기능\n- JWT 세션 관리",
        },
      ]);
    });
  });

  // 기존 테스트들 유지
  test("getGitDiff returns filtered diff", () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from("file1.ts\nfile2.ts"));
    mockedExecSync.mockReturnValueOnce(Buffer.from("diff for file1"));
    mockedExecSync.mockReturnValueOnce(Buffer.from("diff for file2"));

    const diff = (generator as any).getGitDiff();
    expect(diff).toBe("diff for file1diff for file2");
  });

  // ... (나머지 기존 테스트 코드 유지)

  describe("parseCommitMessages with different languages", () => {
    test("correctly parses Korean commit messages", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key", {
        language: "ko",
      });
      const response = `1. feat: 사용자 인증 기능 추가
JWT를 이용한 인증 시스템 구현:
- 로그인/로그아웃 기능 추가
- 토큰 기반 인증 구현

2. docs: README 문서 개선
한국어 가이드 추가 및 포맷팅 개선`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        {
          title: "feat: 사용자 인증 기능 추가",
          body: "JWT를 이용한 인증 시스템 구현:\n- 로그인/로그아웃 기능 추가\n- 토큰 기반 인증 구현",
        },
        {
          title: "docs: README 문서 개선",
          body: "한국어 가이드 추가 및 포맷팅 개선",
        },
      ]);
    });

    test("correctly parses Japanese commit messages", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key", {
        language: "ja",
      });
      const response = `1. feat: 認証機能を追加
JWT認証システムの実装:
- ログイン/ログアウト機能
- トークンベース認証

2. docs: READMEを改善
日本語ガイドを追加、フォーマットを改善`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        {
          title: "feat: 認証機能を追加",
          body: "JWT認証システムの実装:\n- ログイン/ログアウト機能\n- トークンベース認証",
        },
        {
          title: "docs: READMEを改善",
          body: "日本語ガイドを追加、フォーマットを改善",
        },
      ]);
    });
  });
});
