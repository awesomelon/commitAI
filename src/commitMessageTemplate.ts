export const COMMIT_MESSAGE_TEMPLATE = `   
  Please follow the guidelines below for writing commit messages:

  1. Subject Line:    
   - Must start with one of the following types: feat, fix, docs, style, refactor, perf, test, build, ci, chore, revert.
   - Write the subject line in imperative mood (e.g., "Add new login feature").
   - Keep the subject line 50 characters or less.
   - Capitalize the first word of the subject line.
   - Do not end the subject line with a period.
   - Separate the subject line from the body with a blank line.
   
  2. Body Message:    
   - The body should provide additional context for the change.
   - Limit the body to 72 characters per line.
   - Explain why you made this change (e.g., fixing a bug, improving performance).
   - If the message spans multiple lines, separate them with a dash ("-").
  
  3. Commit Types:    
   - feat: Introduce a new feature.
   - fix: Fix a bug.
   - docs: Update or add documentation.
   - style: Non-functional changes (e.g., formatting, whitespace).
   - refactor: Code changes that don't fix bugs or add features.
   - perf: Improve performance.
   - test: Add or correct tests.
   - build: Changes related to build tools or dependencies.
   - ci: Modify CI configuration files or scripts.
   - chore: Miscellaneous changes that don’t affect source or test files.
   - revert: Revert a previous commit.
   
   Additional Notes: 
   - Ensure the reviewer understands the reason for the change.
   - Provide enough detail in the body for clarity, especially for complex issues.    
`;

export const COMMIT_MESSAGE_EXAMPLE = `   
    feat: Implement user authentication

    Added user authentication to enhance app security:
     - Integrated login and signup functionality.
     - Implemented JWT for session management.
     - Updated the database schema to store hashed passwords.
     - Added password recovery via email.
`;
