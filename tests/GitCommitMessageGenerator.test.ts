import GitCommitMessageGenerator from "../src/GitCommitMessageGenerator";
import { Anthropic } from "@anthropic-ai/sdk";
import { execSync } from "child_process";

jest.mock("@anthropic-ai/sdk");
jest.mock("child_process");

describe("GitCommitMessageGenerator", () => {
  let generator: GitCommitMessageGenerator;
  const mockedExecSync = execSync as jest.MockedFunction<typeof execSync>;
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
    const mockResponse = {
      content: [{ text: '1. "Generated commit message"' }],
    };

    (generator as any).getGitDiff = jest.fn().mockReturnValue(mockDiff);
    (generator as any).callClaudeAPI = jest
      .fn()
      .mockResolvedValue(mockResponse);

    const messages = await generator.generateCommitMessages();

    expect((generator as any).getGitDiff).toHaveBeenCalled();
    expect((generator as any).callClaudeAPI).toHaveBeenCalledWith(mockDiff);
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
});
