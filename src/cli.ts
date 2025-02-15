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

async function saveConfig(options: { key?: string; language?: string; provider?: string }) {
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

  if (options.provider) {
    if (options.provider !== "anthropic" && options.provider !== "openai") {
      console.error(`Provider "${options.provider}" is not supported. Supported providers are: anthropic, openai`);
    } else {            
      config.set("provider", options.provider);
      messages.push(`Default provider set to: ${options.provider}`);
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
    console.log(`Default Provider: ${config.get("provider") || "Not Set"}`);
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

function getProvider(): string {
  return config.get("provider") || "openai";
}

function showConfig() {
  const currentLang = getLanguage();
  const currentProvider = getProvider();  
  console.log("\nCurrent Configuration:");
  console.log("--------------------");
  console.log(`Default Language: ${currentLang}`);
  console.log(`AI Provider: ${currentProvider}`);
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
  .option("-k, --key <key>", "Set API key")
  .option("-n, --number <number>", "Number of commit message suggestions", "3")
  .option(
    "-l, --language <code>",
    "Set default language for commit messages (e.g., en, ko, ja)",
  )
  .option("-p, --provider <provider>", "Set default AI provider (anthropic or openai)")
  .option("--show-config", "Show current configuration")
  .action(async (options) => {  
    if (options.key || options.language || options.provider) {      
      await saveConfig({
        key: options.key,
        language: options.language,
        provider: options.provider,
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
      provider: getProvider() as "anthropic" | "openai",
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
