# src 폴더

```ts
/* ./src/GitCommitMessageGenerator.ts */
import { execSync } from "child_process";
import { Anthropic, ClientOptions } from "@anthropic-ai/sdk";
import {
  COMMIT_MESSAGE_EXAMPLE,
  COMMIT_MESSAGE_TEMPLATE,
} from "./commitMessageTemplate.js";

interface GeneratorOptions {
  maxTokens?: number;
  temperature?: number;
  model?: string;
  numberOfSuggestions?: number;
  maxFileSizeKB?: number;
}

interface CommitMessage {
  title: string;
  body: string;
}

class GitCommitMessageGenerator {
  private anthropic: Anthropic;
  private options: Required<GeneratorOptions>;

  constructor(apiKey: string, options: GeneratorOptions = {}) {
    this.anthropic = new Anthropic({ apiKey } as ClientOptions);
    this.options = this.initializeOptions(options);
  }

  private initializeOptions(
    options: GeneratorOptions,
  ): Required<GeneratorOptions> {
    return {
      maxTokens: options.maxTokens || 400,
      temperature: options.temperature || 0,
      model: options.model || "claude-3-5-sonnet-20240620",
      numberOfSuggestions: options.numberOfSuggestions || 3,
      maxFileSizeKB: options.maxFileSizeKB || 100,
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
    let prompt = `You are a professional Git commit message writer. \n Write commit messages using the provided template and example. \n Template: ${COMMIT_MESSAGE_TEMPLATE}. \n Example: ${COMMIT_MESSAGE_EXAMPLE}. \n\n Generate ${this.options.numberOfSuggestions} commit messages for the following Git diff:`;
    prompt += `\n\n${diff} \n\n If there are no changes, you must return "No changes".`;
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

export default GitCommitMessageGenerator;
```

```ts
/* ./src/cli.ts */
import { program } from 'commander';
import Configstore from 'configstore';
import { select } from '@inquirer/prompts';
import ora from 'ora';
import GitCommitMessageGenerator from './GitCommitMessageGenerator.js';

const VERSION = '__VERSION__';

const config = new Configstore('commit-ai');

async function saveApiKey(key: string) {
  config.set('apiKey', key);
  console.log('API key successfully saved.');
}

function getApiKey() {
  const apiKey = config.get('apiKey');
  if (!apiKey) {
    console.error('API key not set. Please set it using the --key option.');
    return null;
  }
  return apiKey;
}

async function generateAndSelectCommitMessage(generator: GitCommitMessageGenerator) {
  const spinner = ora('Generating commit messages...').start();
  const commitMessages = await generator.generateCommitMessages();
  spinner.succeed('Commit messages successfully generated.');

  const choices = commitMessages.map((msg, index) => ({
    name: `${index + 1}. ${msg.title}`,
    value: msg,
    description: `\n${msg.title}\n\n${msg.body}`,
  }));

  return select({
    message: 'Select a commit message to use',
    choices: [...choices, { name: `🌟. Cancel`, value: null }],
  });
}

async function commitChanges(generator: GitCommitMessageGenerator, message: any) {
  const spinner = ora('Committing changes...').start();
  await generator.commitChanges(message);
  spinner.succeed('Changes successfully committed!');
}

program
  .version(VERSION)
  .description('Automatically generate commit messages using AI')
  .option('-k, --key <key>', 'Set Anthropic API key')
  .option('-m, --max-tokens <number>', 'Set max tokens for message generation', '300')
  .option('-t, --temperature <number>', 'Set temperature for message generation', '0.7')
  .option('-n, --number <number>', 'Number of commit message suggestions', '3')
  .option('--max-file-size <number>', 'Maximum file size in KB to include in diff', '100')
  .action(async (options) => {
    if (options.key) {
      await saveApiKey(options.key);
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) return;

    const generator = new GitCommitMessageGenerator(apiKey, {
      maxTokens: parseInt(options.maxTokens),
      temperature: parseFloat(options.temperature),
      numberOfSuggestions: parseInt(options.number),
      maxFileSizeKB: parseInt(options.maxFileSize),
    });

    try {
      const selectedMessage = await generateAndSelectCommitMessage(generator);

      if (selectedMessage) {
        await commitChanges(generator, selectedMessage);
      } else {
        console.log('Commit cancelled by user.');
      }
    } catch (error) {
      console.error('Error:', (error as Error).message);
    }
  });

program.parse(process.argv);
```

```ts
/* ./src/commitMessageTemplate.ts */
export const COMMIT_MESSAGE_TEMPLATE = `   
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

    Remember, well-written commit messages are crucial for maintaining a clean and understandable version history. They help team members and future contributors quickly understand the purpose and impact of each change.  
`;

export const COMMIT_MESSAGE_EXAMPLE = `   
    feat: Implement user authentication

    Added user authentication to enhance app security:
     - Integrated login and signup functionality.
     - Implemented JWT for session management.
     - Updated the database schema to store hashed passwords.
     - Added password recovery via email.
`;
```

