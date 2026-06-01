# Security Policy

## Supported Versions

Security review currently focuses on the latest `0.1.x` release line.

## Reporting a Vulnerability

Please report vulnerabilities through GitHub private vulnerability reporting if it is enabled for the repository. If it is not enabled, open a minimal public issue that describes the affected area without exploit details, and the maintainers will arrange a private follow-up channel.

Do not include secrets, private repository content, or sensitive task logs in public issues.

## Security Boundaries

- CX2 tasks must start only from Human-approved prompt text.
- CX2 approval requests must be routed back to CX1/Human.
- Automatic approval is out of scope.
- Logs may contain prompts, command output, and task context. Keep the configured log root outside public repositories.
- The controller runs a local CodexCLI binary configured by `allowedCodexBinary`.
