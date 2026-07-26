# Security Policy

## Supported Versions

Security fixes are applied to the latest active release on the default branch. Older major or minor releases generally do not receive backports unless a vulnerability is highly severe, straightforward to backport, and the version remains widely used.

| Version         | Supported      |
| --------------- | -------------- |
| Active (latest) | ✅ Yes         |
| Older versions  | 🔄 Best effort |

## Reporting a Vulnerability

Please **do not** open public GitHub issues or pull requests for security-related reports.

To report a vulnerability privately, please use one of the following channels:

1. **GitHub Security Advisories**: Navigate to the **Security** tab of this repository and select **"Report a vulnerability"** (or use [this link](https://github.com/heroui-inc/tailwind-variants/security/advisories/new)).
2. **Email**: Contact the maintainers listed in the [README](./README.md) (Authors section).

Please include the following details in your report to help us triage it quickly:

- **Affected Package & Entrypoint**: The specific version(s) and entrypoint (e.g., `tailwind-variants`, `/lite`, `/utils`).
- **Reproduction**: A minimal, reproducible example (PoC).
- **Impact**: A brief assessment of what an attacker could potentially achieve.
- **Suggested Fix**: Any recommended remediation or code changes, if available.

We aim to acknowledge actionable reports within **7 days** and provide a remediation plan or status update within **14 days**.

## Scope

`tailwind-variants` is a **client/build-time class name utility**. It joins and optionally merges Tailwind CSS class strings; it does not handle authentication, network requests, or direct filesystem access.

### In Scope

- Unexpected behavior in public APIs (`tv`, `createTV`, `cn`, `cnMerge`, `cx`) that could generate security-relevant, incorrect class outputs in a consuming application.
- Supply chain or published package integrity issues directly affecting official releases of this package.

### Out of Scope

- Vulnerabilities existing solely in consumer applications, frameworks, or third-party bundlers.
- Issues requiring a compromised local developer environment or malicious local dependencies outside of this repository's release pipeline.
- Social engineering reports or theoretical findings lacking a practical technical exploit.

## Safe Use Notes

- **Zero Runtime Dependencies**: The core library is built with zero third-party runtime dependencies, minimizing the potential attack surface and protecting consuming applications from transitive dependency-jacking. The `tailwind-merge` is an optional peer dependency, and its lifecycle/updates are managed entirely by the consuming application.
- **Sanitize Untrusted Input**: Treat class name strings derived from untrusted user input with care. This library does not perform HTML or CSS sanitization. Preventing XSS (Cross-Site Scripting) and style injection remains the responsibility of the host application's rendering and sanitization layers.
- **Use the Lite Entrypoint**: Consider using the `/lite` entrypoint if you do not require conflict merging. This helps minimize the dependency and execution surface of your code path.
- **Keep Dependencies Current**: Regularly update your project dependencies using your standard package manager workflow (e.g., `pnpm` lockfile updates paired with CI verification).

## Disclosure

We prefer coordinated vulnerability disclosure. Please allow maintainers reasonable time to address and ship a fix before publishing details publicly. Credit will gladly be given to reporters who wish to be named once a patch is officially released.
