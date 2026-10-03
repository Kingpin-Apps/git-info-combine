# Git-info-combine

A GitHub Action that combines your GitHub and GitLab activity into cards for your profile README. Private work is counted; private repo and project names are never shown.

> **Status:** early development. All six cards work.

## Cards

| Card | Shows |
|---|---|
| `heatmap` | Contribution calendar across both hosts, each day split by host colour |
| `stats` | Stars, commits, PRs/MRs, issues, reviews and repos contributed to, added up, with a rank |
| `languages` | Top languages across both hosts |
| `wakatime` | Coding time by language from WakaTime (or Wakapi) |
| `pins` | One card per public repo or project you list in `pins` |
| `gists` | One card per public gist or snippet you list in `gists` |

Every card is on by default; `wakatime`, `pins` and `gists` are skipped until you set `wakatime-api-key`, `pins` or `gists`. Choose cards with the `cards` input, for example `cards: heatmap,stats,languages`.

Cards that usually sit side by side get the same height (`equal-heights`, on by default): stats, languages and wakatime match each other, and so do pins and gists.

Pin and gist files are named after what they show: `pins: Kingpin-Apps/git-info-combine` writes `pin-github-kingpin-apps-git-info-combine.svg`.

## Privacy

- Private repos, projects and their activity are **counted**, but their **names are never written** to the cards or the cache.
- Tokens stay in your repo's secrets and are only used inside the Action run.
- The cache (`cache.json`) holds daily counts and opaque ids, nothing else.
- Pins and gists must be public; private repos, internal projects and secret gists are refused.
- WakaTime's project names are dropped; only languages and time are used.
- `exclude-repos` is the one exception you control: your workflow file is public, so naming a private repo there reveals its name.

## Usage

1. Create the tokens:
   - **GitHub:** a classic personal access token with `repo`, `read:org` and `read:user`, so private and organisation activity can be read.
   - **GitLab:** a personal access token with `read_api`.
2. Add them as repository secrets in your profile repo, for example `GIC_GITHUB_TOKEN` and `GIC_GITLAB_TOKEN`.
3. Add the workflow:

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

4. Show the cards in your README. With the default `auto` theme, a `<picture>` follows GitHub's own light or dark setting:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="git-info-combine/heatmap-dark.svg">
  <img alt="Contributions on GitHub and GitLab" src="git-info-combine/heatmap-light.svg">
</picture>
```

Or use `git-info-combine/heatmap.svg`, which follows the viewer's system setting.

See [`action.yml`](action.yml) for every input: themes, colours, hidden stats and languages, heatmap range and more.

## Development

Requires [Bun](https://bun.sh); the version is pinned in `.bun-version`.

```sh
bun install
bun test
bun run typecheck
bun run build    # bundles the Action to dist/index.js (commit the result)

# Try it on real data. Tokens come from the environment.
GIC_GITHUB_TOKEN=... GIC_GITLAB_TOKEN=... bun run fetch
bun run render radical   # writes .out/cards/, with an index.html preview
```

## Credits

Themes, the rank formula and card designs come from [GitHub Stats Extended](https://github.com/stats-organization/github-stats-extended) (MIT). Icons are [Primer Octicons](https://github.com/primer/octicons) (MIT). Language colours are from [GitHub Linguist](https://github.com/github-linguist/linguist) (MIT).

## License

[MIT](LICENSE)
