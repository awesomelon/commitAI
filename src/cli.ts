#!/usr/bin/env node

import { program } from "commander";
import Configstore from "configstore";
import { select, editor, confirm } from "@inquirer/prompts";
import ora from "ora";
import { GitCommitMessageGenerator } from "./GitCommitMessageGenerator.js";

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
    "Language for commit messages (e.g., en, ko, ja)",
    "en",
  )
  .action(async (options) => {
    if (options.key) {
      await saveApiKey(options.key);
      return;
    }

    const apiKey = getApiKey();
    if (!apiKey) return;

    const generator = new GitCommitMessageGenerator(apiKey, {
      numberOfSuggestions: parseInt(options.number),
      language: options.language,
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
