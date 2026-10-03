# Git-info-combine

A GitHub Action that combines your GitHub and GitLab activity into cards for your profile README. Private work is counted; private repo and project names are never shown.

> **Status:** early development. The Action runs but does not build cards yet.

## Cards

| Card | Shows |
|---|---|
| `heatmap` | Contribution calendar across both hosts |
| `stats` | Commits, PRs/MRs, issues, reviews, stars and rank, added up |
| `languages` | Top languages across both hosts |
| `wakatime` | Coding time from WakaTime |
| `pins` | Public repos and projects you choose |
| `gists` | Public GitHub gists and GitLab snippets |

Every card is on by default. Turn cards off with the `cards` input, for example `cards: heatmap,stats,languages`.

## Usage

```yaml
# .github/workflows/git-info-combine.yml in your profile repo
name: Git-info-combine
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:

permissions:
  contents: write

jobs:
  cards:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: Kingpin-Apps/git-info-combine@v1
        with:
          github-token: ${{ secrets.GIC_GITHUB_TOKEN }}
          gitlab-token: ${{ secrets.GIC_GITLAB_TOKEN }}
          # gitlab-url: https://gitlab.example.com  # self-hosted GitLab
```

## Development

Requires [Bun](https://bun.sh).

```sh
bun install
bun test
bun run typecheck
bun run build   # bundles the Action to dist/index.js (commit the result)
```

## Credits

Card designs follow [GitHub Stats Extended](https://github.com/stats-organization/github-stats-extended) (MIT).

## License

[MIT](LICENSE)
