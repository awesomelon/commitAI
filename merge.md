~~# src 폴더

```GitCommitMessageGenerator.ts
import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import path from "node:path";
import * as fs from "node:fs";
import * as os from "node:os";

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  commitMessageFormat?: "conventional" | "freeform" | "template";
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<GeneratorOptions>;

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = {
      maxTokens: options.maxTokens || 100,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20240620",
      commitMessageFormat: options.commitMessageFormat || "conventional",
      numberOfSuggestions: options.numberOfSuggestions || 3,
      maxFileSizeKB: options.maxFileSizeKB || 100, // Default to 100KB
    };
  }

  async generateCommitMessages(): Promise<string[]> {
    const diff = this.getGitDiff();
    const template = this.getCommitTemplate();
    const response = await this.callClaudeAPI(diff, template);
    return this.parseCommitMessages(response.content[0].text);
  }

  private getGitDiff(): string {
    try {
      const stagedFiles = execSync("git diff --cached --name-only")
        .toString()
        .split("\n")
        .filter(Boolean);

      let filteredDiff = "";

      for (const file of stagedFiles) {
        if (this.shouldSkipFile(file)) continue;

        const fileDiff = execSync(`git diff --cached -- "${file}"`).toString();

        const fileSizeKB = Buffer.byteLength(fileDiff, "utf8") / 1024;
        if (fileSizeKB > this.options.maxFileSizeKB) {
          console.warn(
            `Skipping large file: ${file} (${fileSizeKB.toFixed(2)} KB)`,
          );
          continue;
        }

        filteredDiff += fileDiff;
      }

      return filteredDiff;
    } catch (error) {
      throw new Error("Failed to get Git diff: " + (error as Error).message);
    }
  }

  private shouldSkipFile(filename: string): boolean {
    // Skip lock files and other patterns as needed
    const skipPatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.svg$/,
      /\.map$/,
    ];

    return skipPatterns.some((pattern) => pattern.test(filename));
  }

  private getCommitTemplate(): string | null {
    try {
      const templatePath = execSync("git config --get commit.template")
        .toString()
        .trim();
      if (templatePath) {
        let fullPath = templatePath;
        if (templatePath.startsWith("~")) {
          fullPath = path.join(os.homedir(), templatePath.slice(1));
        } else if (!path.isAbsolute(templatePath)) {
          fullPath = path.resolve(process.cwd(), templatePath);
        }

        if (fs.existsSync(fullPath)) {
          const content = fs.readFileSync(fullPath, "utf-8");
          return content;
        } else {
          console.warn(`Commit template file not found: ${fullPath}`);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        console.warn("Commit template not set in Git config");
      } else {
        console.warn(
          "Failed to get commit template:",
          (error as Error).message,
        );
      }
    }
    return null;
  }
  private async callClaudeAPI(
    diff: string,
    template: string | null,
  ): Promise<any> {
    try {
      let prompt = `Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:\n\n${diff}`;

      if (template && this.options.commitMessageFormat === "template") {
        prompt += `Note the commented out ones for reference only. \n\nUse the following commit message template:\n\n${template}`;
      } else if (this.options.commitMessageFormat === "conventional") {
        prompt += "\n\nUse the Conventional Commits format.";
      }

      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      throw new Error("Failed to call Claude API: " + (error as Error).message);
    }
  }

  parseCommitMessages(response: string): string[] {
    const lines = response.split("\n");
    const commitMessages: string[] = [];
    let currentMessage = "";

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*"?(.+?)"?$/);
      if (match) {
        if (currentMessage) {
          commitMessages.push(currentMessage.trim());
        }
        currentMessage = match[1];
      } else if (line.trim() && currentMessage) {
        currentMessage += " " + line.trim();
      }
    }

    if (currentMessage) {
      commitMessages.push(currentMessage.trim());
    }

    return commitMessages.map((msg) => msg.replace(/^"(.+)"$/, "$1"));
  }

  async commitChanges(message: string): Promise<void> {
    try {
      const stagedChanges = execSync("git diff --cached --name-only")
        .toString()
        .trim();
      if (!stagedChanges) {
        throw new Error("No changes staged for commit");
      }

      const escapedMessage = message.replace(/"/g, '\\"');
      execSync(`git commit -m "${escapedMessage}"`);
    } catch (error) {
      throw new Error("Failed to commit changes: " + (error as Error).message);
    }
  }
}

export default GitCommitMessageGenerator;
```

```cli.ts
#!/usr/bin/env node
import { program } from "commander";
import Configstore from "configstore";
import { select } from "@inquirer/prompts";
import ora from "ora";
import GitCommitMessageGenerator from "./GitCommitMessageGenerator.js";

const VERSION = "__VERSION__";

const config = new Configstore("commit-ai");

program
  .version(VERSION)
  .description("Automatically generate commit messages using AI")
  .option("-k, --key <key>", "Set Anthropic API key")
  .option(
    "-m, --max-tokens <number>",
    "Set max tokens for message generation",
    "300",
  )
  .option(
    "-t, --temperature <number>",
    "Set temperature for message generation",
    "0.7",
  )
  .option(
    "-f, --format <format>",
    "Set commit message format (conventional or freeform)",
    "conventional",
  )
  .option("-n, --number <number>", "Number of commit message suggestions", "3")
  .option(
    "--max-file-size <number>",
    "Maximum file size in KB to include in diff",
    "100",
  )
  .action(async (options) => {
    if (options.key) {
      config.set("apiKey", options.key);
      console.log("API key saved successfully.");
      return;
    }

    const apiKey = config.get("apiKey");
    if (!apiKey) {
      console.error("API key not set. Please set it using --key option.");
      return;
    }

    const generator = new GitCommitMessageGenerator(apiKey, {
      maxTokens: parseInt(options.maxTokens),
      temperature: parseFloat(options.temperature),
      commitMessageFormat: options.format as "conventional" | "freeform",
      numberOfSuggestions: parseInt(options.number),
      maxFileSizeKB: parseInt(options.maxFileSize),
    });

    try {
      const spinner = ora("Generating commit messages...").start();
      const commitMessages = await generator.generateCommitMessages();
      spinner.succeed("Commit messages generated successfully.");

      const answer = await select({
        message: "Select a commit message to use",
        choices: [
          ...commitMessages.map((msg, index) => ({
            name: `${index + 1}. ${msg}`,
            value: msg,
          })),
          { name: "Cancel", value: null },
        ],
      });

      if (answer) {
        spinner.start("Committing changes...");
        await generator.commitChanges(answer);
        spinner.succeed("Changes Committed successfully!");
      } else {
        console.log("Commit cancelled by user.");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
    }
  });

program.parse(process.argv);
```

# tests 폴더

```GitCommitMessageGenerator.test.ts
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
```~~

