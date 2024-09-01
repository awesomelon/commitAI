export const COMMIT_MESSAGE_TEMPLATE = `
    Example commit message template
    ======================
    # <type>: <subject>
    # Subject 50 characters or less
    # Separate headings and body by a single line
    
    # <BLANK LINE>
    # Body Message
    # 72 characters or less
    # Why did you make this change?
    # Separate multi-line messages with "-"
   
    # <BLANK LINE>
    # --- COMMIT END ---
    # <type> (required)
    # - feat: A new feature
    # - fix: A bug fix
    # - docs: Documentation only changes
    # - style: Changes that do not affect the meaning of the code (white-space, formatting, missing semi-colons, etc)
    # - refactor: A code change that neither fixes a bug nor adds a feature
    # - perf: A code change that improves performance
    # - test: Adding missing or correcting existing tests
    # - build: Changes that affect the build system or external dependencies (example scopes: gulp, broccoli, npm)
    # - ci: Changes to our CI configuration files and scripts (example scopes: Travis, Circle, BrowserStack, SauceLabs)
    # - chore: Other changes that don't modify src or test files
    # - revert: Reverts a previous commit    
    # --------------------
    # Remember to:
    # - Capitalize the subject line
    # - Use the imperative mood in the subject line
    # - Do not end the subject line with a period
    # - Separate subject from body with a blank line
    # - Use the body to explain what changes you have made and why you made them
    # - Do not assume the reviewer understands what the original problem was, ensure you add it
    ======================    
`;
