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
      maxTokens: options.maxTokens || 400,
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
    return execSync("git diff --cached --name-only")
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
    return execSync(`git diff --cached -- "${file}"`).toString();
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

    let prompt = `You are a professional Git commit message writer. \n`;
    prompt += `Write commit messages using the provided template and example. \n`;
    prompt += `Template: ${template}. \n Example: ${COMMIT_MESSAGE_EXAMPLE}. \n\n`;
    prompt += `Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:`;
    prompt += `\n\n${diff} \n\n`;
    prompt += `If there are no changes, you must return "No changes".`;

    return prompt;
  }

  parseCommitMessages(response: string): CommitMessage[] {
    const lines = response.split("\n");
    const commitMessages: CommitMessage[] = [];
    let currentMessage: string[] = [];

    for (const line of lines) {
      const match = line.match(/^\d+\.\s*(.+)$/);
      if (match) {
        if (currentMessage.length > 0) {
          commitMessages.push(this.createCommitMessage(currentMessage));
          currentMessage = [];
        }
        currentMessage.push(match[1].replace(/^"|"$/g, "").trim());
      } else if (currentMessage.length > 0 && line.trim()) {
        currentMessage.push(line.trim());
      }
    }

    if (currentMessage.length > 0) {
      commitMessages.push(this.createCommitMessage(currentMessage));
    }

    return commitMessages;
  }

  private createCommitMessage(lines: string[]): CommitMessage {
    const title = lines[0];
    const body = lines.slice(1).join("\n").trim();
    return { title, body };
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
    const stagedChanges = execSync("git diff --cached --name-only")
      .toString()
      .trim();
    if (!stagedChanges) {
      throw new Error("No staged changes to commit");
    }
  }

  private executeGitCommit(message: CommitMessage): void {
    const fullMessage = `${message.title}\n\n${message.body}`;
    const escapedMessage = fullMessage.replace(/"/g, '\\"');
    execSync(`git commit -m "${escapedMessage}"`);
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
  en: "Write the commit message in English",
  ko: "Write both the title and body in Korean. Follow the same format but use Korean language.",
  ja: "Write both the title and body in Japanese. Follow the same format but use Japanese language.",
  "zh-CN":
    "Write both the title and body in Simplified Chinese. Follow the same format but use Chinese language.",
  "zh-TW":
    "Write both the title and body in Traditional Chinese. Follow the same format but use Chinese language.",
};

export const COMMIT_MESSAGE_TEMPLATE = (lang: string) => {
  const languageInstruction =
    LANGUAGE_INSTRUCTIONS[lang] || LANGUAGE_INSTRUCTIONS.en;

  return `
   When writing commit messages, please adhere to the following guidelines to ensure clear, consistent, and informative version control:

    1. Subject Line:
       - Start with one of these types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert
       - Use imperative mood (e.g., "Add new login feature")
       - Limit to 50 characters or less
       - Capitalize the first word
       - Do not end with a period
       - Separate from the body with a blank line
    
    2. Body Message:
       - Provide additional context for the change
       - Limit each line to 72 characters
       - Explain the reason for the change (e.g., fixing a bug, improving performance)
       - Use dashes (-) to separate multiple lines
    
    3. Commit Types and Their Usage:
       - feat: Introduce a new feature
       - fix: Correct a bug
       - docs: Update or add documentation
       - style: Make non-functional changes (e.g., formatting, whitespace)
       - refactor: Restructure code without fixing bugs or adding features
       - perf: Improve performance
       - test: Add or correct tests
       - build: Modify build tools or dependencies
       - ci: Change CI configuration files or scripts
       - chore: Make miscellaneous changes not affecting source or test files
       - revert: Undo a previous commit
    
    4. Best Practices:
       - Ensure the reviewer can understand the reason for the change
       - Provide sufficient detail in the body, especially for complex issues
       - Use clear and concise language throughout the message
       - ${languageInstruction}

    Remember, well-written commit messages are crucial for maintaining a clean and understandable version history. They help team members and future contributors quickly understand the purpose and impact of each change.  
`;
};

export const COMMIT_MESSAGE_EXAMPLE = `   
    feat: Implement user authentication

    Added user authentication to enhance app security:
     - Integrated login and signup functionality.
     - Implemented JWT for session management.
     - Updated the database schema to store hashed passwords.
     - Added password recovery via email.
`;
```

