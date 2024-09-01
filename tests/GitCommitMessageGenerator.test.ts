import GitCommitMessageGenerator from "../src/GitCommitMessageGenerator";
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

  test("constructor sets default options", () => {
    expect((generator as any).options).toEqual({
      maxTokens: 400,
      temperature: 0,
      model: "claude-3-5-sonnet-20240620",
      numberOfSuggestions: 3,
      maxFileSizeKB: 100,
    });
  });

  test("getGitDiff returns filtered diff", () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from("file1.ts\nfile2.ts"));
    mockedExecSync.mockReturnValueOnce(Buffer.from("diff for file1"));
    mockedExecSync.mockReturnValueOnce(Buffer.from("diff for file2"));

    const diff = (generator as any).getGitDiff();
    expect(diff).toBe("diff for file1diff for file2");
  });

  test("shouldSkipFile correctly identifies files to skip", () => {
    expect((generator as any).shouldSkipFile("package-lock.json")).toBe(true);
    expect((generator as any).shouldSkipFile("src/index.ts")).toBe(false);
  });

  test("parseCommitMessages correctly extracts messages", () => {
    const response =
      '1. "feat: First commit message"\nThis is the body of the first message.\n\n2. "fix: Second commit message"\nThis is the body of the second message.';
    const messages = (generator as any).parseCommitMessages(response);
    expect(messages).toEqual([
      {
        title: "feat: First commit message",
        body: "This is the body of the first message.",
      },
      {
        title: "fix: Second commit message",
        body: "This is the body of the second message.",
      },
    ]);
  });

  test("generateCommitMessages calls necessary methods and returns messages", async () => {
    const mockDiff = "mock diff";
    const mockResponse = {
      content: [
        {
          text: '1. "feat: Generated commit message"\nThis is the body of the message.',
        },
      ],
    };

    (generator as any).getGitDiff = jest.fn().mockReturnValue(mockDiff);
    (generator as any).callClaudeAPI = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const messages = await generator.generateCommitMessages();

    expect((generator as any).getGitDiff).toHaveBeenCalled();
    expect((generator as any).callClaudeAPI).toHaveBeenCalledWith(mockDiff);
    expect(messages).toEqual([
      {
        title: "feat: Generated commit message",
        body: "This is the body of the message.",
      },
    ]);
  });

  test("commitChanges executes git commit command", async () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from("staged changes"));

    await generator.commitChanges({
      title: "feat: Test commit message",
      body: "Test commit body",
    });

    expect(mockedExecSync).toHaveBeenCalledWith(
      'git commit -m "feat: Test commit message\n\nTest commit body"',
    );
  });

  test("commitChanges throws error when no changes are staged", async () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from(""));

    await expect(
      generator.commitChanges({
        title: "feat: Test commit message",
        body: "Test commit body",
      }),
    ).rejects.toThrow("No changes staged for commit");
  });

  test("callClaudeAPI calls Anthropic API with correct parameters", async () => {
    const mockCreate = jest
      .fn()
      .mockResolvedValue({ content: [{ text: "API Response" }] });
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () =>
        ({
          messages: { create: mockCreate },
        }) as any,
    );

    const generator = new GitCommitMessageGenerator("fake-api-key");
    await (generator as any).callClaudeAPI("Test diff");

    expect(mockCreate).toHaveBeenCalledWith({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 400,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: expect.stringContaining("Test diff"),
        },
      ],
    });
  });

  test("getGitDiff skips large files", () => {
    mockedExecSync.mockReturnValueOnce(
      Buffer.from("large-file.txt\nsmall-file.txt"),
    );
    mockedExecSync.mockReturnValueOnce(Buffer.from("a".repeat(200 * 1024))); // 200KB file
    mockedExecSync.mockReturnValueOnce(Buffer.from("small file content"));

    const generator = new GitCommitMessageGenerator("fake-api-key", {
      maxFileSizeKB: 100,
    });
    const diff = (generator as any).getGitDiff();

    expect(diff).not.toContain("a".repeat(200 * 1024));
    expect(diff).toContain("small file content");
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Skipping large file: large-file.txt"),
    );
  });

  test("callClaudeAPI includes COMMIT_MESSAGE_TEMPLATE in the prompt", async () => {
    const mockCreate = jest
      .fn()
      .mockResolvedValue({ content: [{ text: "API Response" }] });
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => ({ messages: { create: mockCreate } }) as any,
    );

    const generator = new GitCommitMessageGenerator("fake-api-key");
    await (generator as any).callClaudeAPI("Test diff");

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(COMMIT_MESSAGE_TEMPLATE),
          }),
        ],
      }),
    );
  });

  describe("parseCommitMessages", () => {
    test("correctly parses multi-line commit messages", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key");
      const response = `Here are 3 commit messages using the Conventional Commits format for the given Git diff:

1. "feat(generator): add support for commit message templates"
This feature allows users to use custom commit message templates.

2. "test(generator): add unit tests for commit template functionality"
Added comprehensive unit tests to ensure the commit template feature works as expected.

3. "docs(readme): add blank line after project description"
Improved README formatting for better readability.`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        {
          title: "feat(generator): add support for commit message templates",
          body: "This feature allows users to use custom commit message templates.",
        },
        {
          title:
            "test(generator): add unit tests for commit template functionality",
          body: "Added comprehensive unit tests to ensure the commit template feature works as expected.",
        },
        {
          title: "docs(readme): add blank line after project description",
          body: "Improved README formatting for better readability.",
        },
      ]);
    });

    test("handles single-line commit messages", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key");
      const response = `1. "feat: add new feature"
2. "fix: resolve bug"
3. "chore: update dependencies"`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        { title: "feat: add new feature", body: "" },
        { title: "fix: resolve bug", body: "" },
        { title: "chore: update dependencies", body: "" },
      ]);
    });

    test("correctly extracts messages with or without quotes", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key");
      const response =
        '1. "feat: First commit message"\nBody of first message\n\n2. fix: Second commit message\nBody of second message';
      const messages = (generator as any).parseCommitMessages(response);
      expect(messages).toEqual([
        { title: "feat: First commit message", body: "Body of first message" },
        { title: "fix: Second commit message", body: "Body of second message" },
      ]);
    });
  });
});
