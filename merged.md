# src 폴더

```ts
/* ./src/GitCommitMessageGenerator.ts */
import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import {
  COMMIT_MESSAGE_EXAMPLE,
  COMMIT_MESSAGE_TEMPLATE,
} from "./commitMessageTemplate.js";

const SUPPORTED_LANGUAGES = ["en", "ko", "ja", "zh-CN", "zh-TW"] as const;
type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
  language?: string;
}

interface CommitMessage {
  title: string;
  body: string;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<Omit<GeneratorOptions, "language">> & {
    language: SupportedLanguage;
  };

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = this.initializeOptions(options);
  }

  private validateLanguage(lang: string): SupportedLanguage {
    if (!lang || !SUPPORTED_LANGUAGES.includes(lang as SupportedLanguage)) {
      console.warn(
        `Language "${lang}" is not supported. Falling back to English (en).`,
      );
      return "en";
    }
    return lang as SupportedLanguage;
  }

  private initializeOptions(options: GeneratorOptions): Required<
    Omit<GeneratorOptions, "language">
  > & {
    language: SupportedLanguage;
  } {
    return {
      maxTokens: options.maxTokens || 500,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20241022",
      numberOfSuggestions: options.numberOfSuggestions || 3,
      maxFileSizeKB: options.maxFileSizeKB || 100,
      language: this.validateLanguage(options.language || "en"),
    };
  }

  async generateCommitMessages(): Promise<CommitMessage[]> {
    try {
      const diff = this.getGitDiff();
      const response = await this.callClaudeAPI(diff);
      return this.parseCommitMessages(response.content[0].text);
    } catch (error) {
      console.error(
        `Error generating commit messages: ${(error as Error).message}`,
      );
      throw error;
    }
  }

  private getGitDiff(): string {
    try {
      const stagedFiles = this.getStagedFiles();
      return this.getFilteredDiff(stagedFiles);
    } catch (error) {
      throw new Error(`Failed to get Git diff: ${(error as Error).message}`);
    }
  }

  private getStagedFiles(): string[] {
    return execSync("git diff --staged --name-only", {
      encoding: "utf8",
    })
      .toString()
      .split("\n")
      .filter(Boolean);
  }

  private getFilteredDiff(stagedFiles: string[]): string {
    let filteredDiff = "";
    for (const file of stagedFiles) {
      if (this.shouldSkipFile(file)) continue;
      const fileDiff = this.getFileDiff(file);
      if (this.isFileTooLarge(fileDiff)) {
        console.warn(
          `Skipping large file: ${file} (${this.getFileSizeKB(fileDiff).toFixed(2)} KB)`,
        );
        continue;
      }
      filteredDiff += fileDiff;
    }
    return filteredDiff;
  }

  private getFileDiff(file: string): string {
    return execSync(`git diff --staged -- "${file}"`, {
      encoding: "utf8",
    }).toString();
  }

  private isFileTooLarge(fileDiff: string): boolean {
    return this.getFileSizeKB(fileDiff) > this.options.maxFileSizeKB;
  }

  private getFileSizeKB(fileDiff: string): number {
    return Buffer.byteLength(fileDiff, "utf8") / 1024;
  }

  private shouldSkipFile(filename: string): boolean {
    const skipPatterns = [
      /package-lock\.json$/,
      /yarn\.lock$/,
      /pnpm-lock\.yaml$/,
      /\.svg$/,
      /\.map$/,
    ];
    return skipPatterns.some((pattern) => pattern.test(filename));
  }

  private async callClaudeAPI(diff: string): Promise<any> {
    try {
      const prompt = this.buildPrompt(diff);

      return await this.anthropic.messages.create({
        model: this.options.model,
        max_tokens: this.options.maxTokens,
        temperature: this.options.temperature,
        messages: [{ role: "user", content: prompt }],
      });
    } catch (error) {
      throw new Error(`Failed to call Claude API: ${(error as Error).message}`);
    }
  }

  private buildPrompt(diff: string): string {
    const template = COMMIT_MESSAGE_TEMPLATE(this.options.language);
    return `
        You are a professional Git commit message writer. \n
        Write commit messages using the provided template and example. \n
        Template: ${template} \n
        Example: ${COMMIT_MESSAGE_EXAMPLE} \n\n 
        
        Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff: \n      
        ${diff} \n
        
        If there are no changes, you must return "No changes".`;
  }

  parseCommitMessages(response: string): CommitMessage[] {
    const cleanResponse = response
      .replace(/```\w*\n?/g, "")
      .replace(/^\s+|\s+$/g, "");

    const messages: CommitMessage[] = [];
    const messageBlocks = cleanResponse.split(/\n\s*\n(?=\d+\.)/);

    for (const block of messageBlocks) {
      const lines = block
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      const titleMatch = lines[0]?.match(/^\d+\.\s*(.+)$/);

      if (titleMatch) {
        const title = titleMatch[1]
          .replace(/^["']/, "")
          .replace(/["']$/, "")
          .trim();
        const body = lines.slice(1).join("\n").trim();

        if (title) {
          messages.push({ title, body });
        }
      }
    }

    return messages;
  }

  async commitChanges(message: CommitMessage): Promise<void> {
    try {
      this.validateStagedChanges();
      this.executeGitCommit(message);
    } catch (error) {
      throw new Error(`No changes staged for commit`);
    }
  }

  private validateStagedChanges(): void {
    const stagedChanges = execSync("git diff --staged --name-only", {
      encoding: "utf8",
    })
      .toString()
      .trim();
    if (!stagedChanges) {
      throw new Error("No staged changes to commit");
    }
  }

  private executeGitCommit(message: CommitMessage): void {
    const fullMessage = `${message.title}\n\n${message.body}`;
    const escapedMessage = fullMessage.replace(/"/g, '\\"');
    execSync(`git commit -m "${escapedMessage}"`, { encoding: "utf8" });
  }
}

export {
  GitCommitMessageGenerator,
  SUPPORTED_LANGUAGES,
  type SupportedLanguage,
};
```

```ts
/* ./src/cli.ts */
#!/usr/bin/env node

import { program } from "commander";
import Configstore from "configstore";
import { select, editor, confirm } from "@inquirer/prompts";
import ora from "ora";
import {
  GitCommitMessageGenerator,
  SUPPORTED_LANGUAGES,
} from "./GitCommitMessageGenerator.js";

const VERSION = "__VERSION__";
const config = new Configstore("commit-ai");

async function saveConfig(options: { key?: string; language?: string }) {
  let configChanged = false;
  let messages: string[] = [];

  if (options.key) {
    config.set("apiKey", options.key);
    messages.push("API key successfully saved");
    configChanged = true;
  }

  if (options.language) {
    if (!SUPPORTED_LANGUAGES.includes(options.language as any)) {
      console.error(
        `Language "${options.language}" is not supported. Supported languages are: ${SUPPORTED_LANGUAGES.join(", ")}`,
      );
    } else {
      config.set("language", options.language);
      messages.push(`Default language set to: ${options.language}`);
      configChanged = true;
    }
  }

  if (configChanged) {
    console.log("\nConfiguration updated:");
    messages.forEach((msg) => console.log(`✓ ${msg}`));

    // Show current config after update
    console.log("\nCurrent Configuration:");
    console.log("--------------------");
    console.log(`Default Language: ${getLanguage()}`);
    console.log(`API Key: ${config.get("apiKey") ? "Set" : "Not Set"}`);
  }
}

function getApiKey() {
  const apiKey = config.get("apiKey");
  if (!apiKey) {
    console.error("API key not set. Please set it using the --key option.");
    return null;
  }
  return apiKey;
}

function getLanguage(): string {
  return config.get("language") || "en";
}

function showConfig() {
  const currentLang = getLanguage();
  console.log("\nCurrent Configuration:");
  console.log("--------------------");
  console.log(`Default Language: ${currentLang}`);
  console.log(`API Key: ${config.get("apiKey") ? "Set" : "Not Set"}`);
  console.log("\nSupported Languages:");
  console.log("-------------------");
  SUPPORTED_LANGUAGES.forEach((lang) => {
    console.log(`${lang}${lang === currentLang ? " (current)" : ""}`);
  });
}

async function editCommitMessage(message: any) {
  const editTitle = await confirm({
    message: "Would you like to edit the commit title?",
    default: false,
  });

  let newTitle = message.title;
  let newBody = message.body;

  if (editTitle) {
    newTitle = await editor({
      message: "Edit commit title:",
      default: message.title,
      waitForUseInput: true,
    });
    newTitle = newTitle.trim();
  }

  const editBody = await confirm({
    message: "Would you like to edit the commit body?",
    default: false,
  });

  if (editBody) {
    newBody = await editor({
      message: "Edit commit body:",
      default: message.body,
      waitForUseInput: true,
    });

    newBody = newBody.trim();
  }

  return {
    title: newTitle,
    body: newBody,
  };
}

async function generateAndSelectCommitMessage(
  generator: GitCommitMessageGenerator,
) {
  const spinner = ora("Generating commit messages...").start();
  const commitMessages = await generator.generateCommitMessages();
  spinner.succeed("Commit messages successfully generated.");

  const choices = commitMessages.map((msg, index) => ({
    name: `${index + 1}. ${msg.title}`,
    value: msg,
    description: `\n${msg.title}\n\n${msg.body}`,
  }));

  const selectedMessage = await select({
    message: "Select a commit message to use",
    choices: [...choices, { name: "🌟 Cancel", value: null }],
  });

  if (selectedMessage) {
    const shouldEdit = await confirm({
      message: "Would you like to edit this commit message?",
      default: false,
    });

    if (shouldEdit) {
      return await editCommitMessage(selectedMessage);
    }
  }

  return selectedMessage;
}

async function commitChanges(
  generator: GitCommitMessageGenerator,
  message: any,
) {
  const spinner = ora("Committing changes...").start();
  await generator.commitChanges(message);
  spinner.succeed("Changes successfully committed!");
}

program
  .version(VERSION)
  .description("Automatically generate commit messages using AI")
  .option("-k, --key <key>", "Set Anthropic API key")
  .option("-n, --number <number>", "Number of commit message suggestions", "3")
  .option(
    "-l, --language <code>",
    "Set default language for commit messages (e.g., en, ko, ja)",
  )
  .option("--show-config", "Show current configuration")
  .action(async (options) => {
    if (options.key || options.language) {
      await saveConfig({
        key: options.key,
        language: options.language,
      });
      return;
    }

    if (options.showConfig) {
      showConfig();
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) return;

    const generator = new GitCommitMessageGenerator(apiKey, {
      numberOfSuggestions: parseInt(options.number),
      language: getLanguage(),
    });

    try {
      const selectedMessage = await generateAndSelectCommitMessage(generator);

      if (selectedMessage) {
        await commitChanges(generator, selectedMessage);
      } else {
        console.log("Commit cancelled by user.");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
    }
  });

program.parse(process.argv);
```

```ts
/* ./src/commitMessageTemplate.ts */
interface LanguageSpecificInstructions {
  [key: string]: string;
}

const LANGUAGE_INSTRUCTIONS: LanguageSpecificInstructions = {
  en: "Format: {type}: {Generate the title in English} + empty line + {Generate the body in English}",
  ko: "Format: {type}: {Generate the title in Korean} + empty line + {Generate the body in Korean}",
  ja: "Format: {type}: {Generate the title in Japanese} + empty line + {Generate the body in Japanese}",
  "zh-CN":
    "Format: {type}: {Generate the title in Simplified Chinese} + empty line + {Generate the body in Simplified Chinese}",
  "zh-TW":
    "Format: {type}: {Generate the title in Traditional Chinese} + empty line + {Generate the body in Traditional Chinese}",
};

export const COMMIT_MESSAGE_TEMPLATE = (lang: string) => {
  const languageInstruction =
    LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS.en;

  return `You are a commit message generator.
Types: feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert
Rules:
- Title: <type>: <subject> (50 chars max)
- One blank line after title
- Body: bullet points with "-"
- ${languageInstruction}

Generate commit messages for this diff. Messages only, no explanations.`;
};

export const COMMIT_MESSAGE_EXAMPLE = `
feat: Add user authentication system\n

- Implement secure login flow\n
- Add JWT token management\n
- Create password reset feature\n
- Set up email verification\n`;
```

