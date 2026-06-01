# Publication Checklist

Use this checklist before publishing the repository or applying to OSS support programs.

## Repository Files

- [x] `LICENSE` exists.
- [x] `CONTRIBUTING.md` exists.
- [x] `SECURITY.md` exists.
- [x] `.gitignore` excludes runtime logs and local package/editor artifacts.
- [x] README explains purpose, safety model, installation, verification, and license.
- [x] Public language policy is documented.

## Privacy and Secret Review

Current file scan should not contain:

- maintainer-specific home-directory paths
- API keys or tokens
- bearer tokens
- GitHub personal access tokens
- private keys
- passwords

Recommended command:

```sh
rg -n "OPENAI_API_KEY|API_KEY|Bearer|sk-[A-Za-z0-9]{20,}|github_pat|ghp_|PRIVATE KEY" -S .
```

## Git History

The current working tree can be cleaned independently from Git history. Before pushing an existing local history to a public remote, scan all commits:

```sh
git grep -n -I -E -e 'OPENAI_API_KEY|API_KEY|Bearer|sk-[A-Za-z0-9]{20,}|github_pat|ghp_|PRIVATE KEY' $(git rev-list --all)
```

If this command returns maintainer-specific local paths or names from old commits, publish from a clean initial commit or rewrite history before pushing.

For the first public release, prefer a separate clean snapshot repository:

- initialize a new Git repository from the current working tree
- create a single initial public commit
- confirm `git log --oneline` contains only the intended public history
- set the GitHub remote only after the clean history is confirmed
- do not push until the final scan and validation results are reviewed

## Validation

Run:

```sh
node --check mcp/cx2-controller/src/server.mjs
node mcp/cx2-controller/test/smoke.mjs
node mcp/cx2-controller/test/wait.mjs
node mcp/cx2-controller/test/model-settings.mjs
node -e 'for (const f of [".codex-plugin/plugin.json",".mcp.json","mcp/cx2-controller/config/defaults.json","mcp/cx2-controller/package.json","mcp/cx2-controller/schemas/task.schema.json","mcp/cx2-controller/schemas/result.schema.json","mcp/cx2-controller/schemas/approval.schema.json"]) JSON.parse(require("fs").readFileSync(f,"utf8")); console.log("json ok")'
```

## Program Application Notes

For Codex for Open Source, use the public repository URL as the primary project URL. If related repositories exist, mention them in the supplemental field rather than splitting the main application target.

Use English for public repository metadata, commit messages, changelog entries, issues, pull requests, and release notes. Keep Japanese explanations in separate translated files or maintainer-facing Codex communication.
