# Security policy

## Supported versions

Security fixes currently target the latest release and the `main` branch.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository.
Do not open a public issue for a vulnerability that could enable command execution,
workflow injection, arbitrary file writes, or secret exposure.

Include a minimal reproduction, affected version, impact, and suggested mitigation
when possible. Maintainers will acknowledge a complete report as soon as practical.

## Execution boundary

clisemver intentionally executes the target command to collect help output. Users
must only inspect code they trust. clisemver does not sandbox the target itself.
The built-in protections are shell-free execution, bounded output, a timeout, and
color-neutral environment defaults.

On Windows, npm `.cmd` / `.bat` binaries are not executed. clisemver reads the
shim text, allowlists npm-style `node` launches, and spawns
`[node, script, ...args]` with `shell: false`. Custom batch files, extra
commands, and unexpected `%VAR%` expansions are rejected. There is no fallback
to `shell: true` or `cmd.exe /c`.
