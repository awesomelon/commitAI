import GitCommitMessageGenerator from "../src/GitCommitMessageGenerator";
import { Anthropic } from "@anthropic-ai/sdk";
import { execSync } from "child_process";
import fs from "fs";

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
      maxTokens: 100,
      temperature: 0,
      model: "claude-3-5-sonnet-20240620",
      commitMessageFormat: "conventional",
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
    const response = '1. "First commit message"\n2. "Second commit message"';
    const messages = (generator as any).parseCommitMessages(response);
    expect(messages).toEqual(["First commit message", "Second commit message"]);
  });

  test("generateCommitMessages calls necessary methods and returns messages", async () => {
    const mockDiff = "mock diff";
    const mockTemplate = "mock template";
    const mockResponse = {
      content: [{ text: '1. "Generated commit message"' }],
    };

    (generator as any).getGitDiff = jest.fn().mockReturnValue(mockDiff);
    (generator as any).getCommitTemplate = jest
      .fn()
      .mockReturnValue(mockTemplate);
    (generator as any).callClaudeAPI = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const messages = await generator.generateCommitMessages();

    expect((generator as any).getGitDiff).toHaveBeenCalled();
    expect((generator as any).getCommitTemplate).toHaveBeenCalled();
    expect((generator as any).callClaudeAPI).toHaveBeenCalledWith(
      mockDiff,
      mockTemplate,
    );
    expect(messages).toEqual(["Generated commit message"]);
  });

  test("commitChanges executes git commit command", async () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from("staged changes"));

    await generator.commitChanges("Test commit message");

    expect(mockedExecSync).toHaveBeenCalledWith(
      'git commit -m "Test commit message"',
    );
  });

  test("commitChanges throws error when no changes are staged", async () => {
    mockedExecSync.mockReturnValueOnce(Buffer.from(""));

    await expect(
      generator.commitChanges("Test commit message"),
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
      max_tokens: 100,
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

  test("getCommitTemplate returns null when no template is set", () => {
    mockedExecSync.mockImplementation(() => {
      throw new Error("No commit template set");
    });

    const template = (generator as any).getCommitTemplate();
    expect(template).toBeNull();
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      "Failed to get commit template:",
      "No commit template set",
    );
  });

  test("callClaudeAPI includes template in prompt when commitMessageFormat is 'template'", async () => {
    const mockCreate = jest
      .fn()
      .mockResolvedValue({ content: [{ text: "API Response" }] });
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => ({ messages: { create: mockCreate } }) as any,
    );

    const generator = new GitCommitMessageGenerator("fake-api-key", {
      commitMessageFormat: "template",
    });
    const diff = "Test diff";
    const template = "Test template";
    await (generator as any).callClaudeAPI(diff, template);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining("Test template"),
          }),
        ],
      }),
    );
  });

  test("callClaudeAPI includes Conventional Commits instruction when commitMessageFormat is 'conventional'", async () => {
    const mockCreate = jest
      .fn()
      .mockResolvedValue({ content: [{ text: "API Response" }] });
    (Anthropic as jest.MockedClass<typeof Anthropic>).mockImplementation(
      () => ({ messages: { create: mockCreate } }) as any,
    );

    const generator = new GitCommitMessageGenerator("fake-api-key", {
      commitMessageFormat: "conventional",
    });
    const diff = "Test diff";
    await (generator as any).callClaudeAPI(diff, null);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: [
          expect.objectContaining({
            content: expect.stringContaining(
              "Use the Conventional Commits format",
            ),
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

2. "test(generator): add unit tests for commit template functionality"

3. "docs(readme): add blank line after project description"`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        "feat(generator): add support for commit message templates",
        "test(generator): add unit tests for commit template functionality",
        "docs(readme): add blank line after project description",
      ]);
    });

    test("handles single-line commit messages", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key");
      const response = `1. "feat: add new feature"
2. "fix: resolve bug"
3. "chore: update dependencies"`;

      const result = (generator as any).parseCommitMessages(response);

      expect(result).toEqual([
        "feat: add new feature",
        "fix: resolve bug",
        "chore: update dependencies",
      ]);
    });

    test("correctly extracts messages with or without quotes", () => {
      const generator = new GitCommitMessageGenerator("fake-api-key");
      const response = '1. "First commit message"\n2. Second commit message';
      const messages = (generator as any).parseCommitMessages(response);
      expect(messages).toEqual([
        "First commit message",
        "Second commit message",
      ]);
    });
  });
});
