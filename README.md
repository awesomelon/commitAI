# commit-ai

commit-ai is a CLI tool that automatically generates Git commit messages using AI, leveraging Claude 3.5 to provide high-quality, standardized commit messages.

![example](./assets/example.gif)

## Key Features

- AI-powered commit message generation using Anthropic's Claude 3.5
- Standardized commit message format following conventional commits
- Multiple commit message suggestions with detailed explanations
- Interactive commit message editing with your system's default editor
- Customizable message generation options
- Easy-to-use CLI interface
- Interactive commit message selection using arrow keys
- Visual progress indication for commit message generation and commit process
- Intelligent file filtering to exclude large files and specific file types (e.g., lock files, SVG, source maps)

## Installation

You can install it globally using npm:

```
npm install -g @j-ho/commit-ai
```

## Usage

Before using commit-ai, you need to set up your Anthropic API key:

```
commit-ai --key YOUR_API_KEY
```

To generate a commit message, simply run:

```
commit-ai
```

### Interactive Message Selection and Editing

1. Select a commit message using arrow keys 
2. Choose to edit the selected message (optional)
3. Edit title and/or body in your system's default text editor 
4. Review and confirm your changes 
5. Commit with the final message

```markdown
# Example workflow:
> Select a commit message to use
  1. feat: Add user authentication
  2. feat: Implement login functionality
  3. feat: Create authentication system
  ✏️  Edit commit message
  🌟 Cancel

# If you choose to edit:
> Would you like to edit the commit title? (y/N)
# Your default editor opens with the current title

> Would you like to edit the commit body? (y/N)
# Your default editor opens with the current body

# Review your changes before confirming
```

### Options

- `-k, --key <key>`: Set Anthropic API key
- `-n, --number <number>`: Number of commit message suggestions to generate (default: 3)


## Commit Message Format

commit-ai follows a standardized commit message format:

1. Subject Line:
   - Starts with a type (feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert)
   - Uses imperative mood
   - Limited to 50 characters
   - Capitalized first word
   - No period at the end

2. Body Message:
   - Provides context and reasoning for the change
   - Limited to 72 characters per line
   - Explains the impact and motivation
   - Uses bullet points for multiple items

```markdown
feat: Implement user authentication

Added user authentication to enhance app security:
 - Integrated login and signup functionality
 - Implemented JWT for session management
 - Updated the database schema to store hashed passwords
 - Added password recovery via email
```

## How It Works

1. Analyzes staged changes in the current Git repository 
2. Filters out large files (configurable, default 100KB) and specific file types (package-lock.json, yarn.lock, pnpm-lock.yaml, .svg, .map)
3. Uses Claude 3.5 to generate multiple commit message candidates based on the diff 
4. Provides interactive selection of the generated messages 
5. Commits the changes with the selected message

## Development

1. Clone the repository
2. Install dependencies: `pnpm install`
3. Build the project: `pnpm build`
4. Run tests: `pnpm test`

## Dependencies

- [@anthropic-ai/sdk](https://www.npmjs.com/package/@anthropic-ai/sdk): For interacting with the Anthropic AI API
- [@inquirer/prompts](https://www.npmjs.com/package/@inquirer/prompts): For interactive command-line user interfaces
- [commander](https://www.npmjs.com/package/commander): For building the command-line interface
- [configstore](https://www.npmjs.com/package/configstore): For storing configuration data
- [ora](https://www.npmjs.com/package/ora): For elegant terminal spinners

## License

This project is licensed under the MIT License.

## Contributing

We welcome all forms of contributions, including bug reports, feature suggestions, and pull requests. For major changes, please open an issue first to discuss what you would like to change.

## Troubleshooting

If you encounter any issues with file paths or commit template detection, please ensure that:
1. Your Git commit template path is correctly set in your Git config
2. The commit template file exists and is readable
3. You're using the correct format option (`-f template`) when you want to use a Git commit template

For any other issues or questions, please open an issue on the GitHub repository.
