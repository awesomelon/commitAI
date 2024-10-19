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
