# Release Process

This project uses automated releases with `bumpp` and GitHub Actions.

## How to Release

### 1. Local Release (Recommended)

Run the release script:

```bash
pnpm run release
```

This will:
1. Prompt you to select the version bump (patch/minor/major)
2. Update the version in package.json
3. Generate/update CHANGELOG.md
4. Create a git commit with the version bump
5. Create a git tag
6. Push the commit and tag to GitHub
7. The GitHub Action will automatically publish to npm

### 2. Manual Workflow Trigger

You can also trigger the release workflow manually from GitHub:

1. Go to Actions → Release workflow
2. Click "Run workflow"
3. This will publish the current version to npm

## Prerequisites

- You must have push access to the repository
- The repository must have the `NPM_TOKEN` secret configured
- Conventional commits are recommended for better changelog generation

## Version Bump Guidelines

- **Patch** (x.x.1): Bug fixes, documentation updates
- **Minor** (x.1.0): New features, non-breaking changes
- **Major** (1.0.0): Breaking changes

## Troubleshooting

If the release fails:

1. Check GitHub Actions logs
2. Ensure NPM_TOKEN is valid
3. Verify you have proper permissions
4. Make sure all tests pass before releasing