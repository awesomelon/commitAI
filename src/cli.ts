#!/usr/bin/env node

import { program } from "commander";
import Configstore from "configstore";
import { select } from "@inquirer/prompts";
import ora from "ora";
import GitCommitMessageGenerator from "./GitCommitMessageGenerator.js";

const VERSION = "__VERSION__";

const config = new Configstore("commit-ai");

async function saveApiKey(key: string) {
  config.set("apiKey", key);
  console.log("API key successfully saved.");
}

function getApiKey() {
  const apiKey = config.get("apiKey");
  if (!apiKey) {
    console.error("API key not set. Please set it using the --key option.");
    return null;
  }
  return apiKey;
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

  return select({
    message: "Select a commit message to use",
    choices: [...choices, { name: `🌟. Cancel`, value: null }],
  });
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
  .option("-n, --number <number>", "Number of commit message suggestions", "3")
  .option(
    "--max-file-size <number>",
    "Maximum file size in KB to include in diff",
    "100",
  )
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
        console.log("Commit cancelled by user.");
      }
    } catch (error) {
      console.error("Error:", (error as Error).message);
    }
  });

program.parse(process.argv);
