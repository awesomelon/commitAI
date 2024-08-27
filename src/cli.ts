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
