# Git-info-combine

A GitHub Action that combines your **GitHub and GitLab** activity into cards for your profile README. Private work is counted; private repo and project names are never shown.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/heatmap-dark.svg">
  <img alt="Example heatmap combining GitHub and GitLab contributions" src="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/heatmap-light.svg">
</picture>

<p>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/stats-dark.svg">
    <img alt="Example stats card" src="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/stats-light.svg">
  </picture>
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/languages-dark.svg">
    <img alt="Example languages card" src="https://raw.githubusercontent.com/KINGH242/KINGH242/main/git-info-combine/languages-light.svg">
  </picture>
</p>

*Live example: [github.com/KINGH242](https://github.com/KINGH242).*

## Why

If most of your work happens on GitLab, in private repos or in company groups, your GitHub contribution graph shows only a small part of it. Git-info-combine reads both hosts with your own tokens, inside your own workflow, and draws one honest picture.

## Cards

| Card | Shows |
|---|---|
| `heatmap` | Contribution calendar across both hosts, each day split by host colour |
| `stats` | Stars, commits, PRs/MRs, issues, reviews and repos contributed to, added up, with a rank |
| `languages` | Top languages across both hosts |
| `hosts` | How your activity splits between GitHub and GitLab: contributions, commits, PRs/MRs and issues |
| `wakatime` | Coding time by language from WakaTime (or Wakapi) |
| `pins` | One card per public repo or project you list in `pins` |
| `gists` | One card per public gist or snippet you list in `gists` |

Every card is on by default; `wakatime`, `pins` and `gists` are skipped until you set `wakatime-api-key`, `pins` or `gists`. Choose cards with the `cards` input, for example `cards: heatmap,stats,languages`.

Cards that usually sit side by side get the same height (`equal-heights`, on by default): stats, languages, hosts and wakatime match each other, and so do pins and gists.

### Layout: rows that line up

Images side by side in a README never quite line up: rows end at different widths, and GitHub spaces them unevenly. The `layout` input has the Action lay the cards out itself:

```yaml
          layout: |
            heatmap
            stats languages
            wakatime hosts
            pins
```

Every row comes out exactly `layout-width` wide (default 800), cards in a row share one height and keep their proportions, and the gap across and down is the same (`layout-gap`, default 10). It writes `layout.svg` with every row, plus `row-1.svg`, `row-2.svg` and so on, each with `-light` and `-dark` versions. `pins` and `gists` mean all of them, two to a row. Use one image for the whole set:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="git-info-combine/layout-dark.svg">
  <img alt="My activity across GitHub and GitLab" src="git-info-combine/layout-light.svg">
</picture>
```

## Usage

1. **Create the tokens.**
   - **GitHub:** a classic personal access token with `repo`, `read:org` and `read:user`, so private and organisation activity can be read. The default `GITHUB_TOKEN` cannot read your activity in other repos.
   - **GitLab:** a personal access token with `read_api`.
2. **Add them as secrets** in your profile repo (the repo named after your username), for example `GIC_GITHUB_TOKEN` and `GIC_GITLAB_TOKEN`.
3. **Add the workflow:**

```yaml
# .github/workflows/git-info-combine.yml in your profile repo
name: Git-info-combine
on:
  schedule:
    - cron: "0 3 * * 1" # Mondays, 03:00 UTC
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
          # pins: |
          #   your-name/your-repo
          #   gitlab:your-group/your-project
```

4. **Run it once** from the Actions tab (*Run workflow*). It commits the cards to `git-info-combine/` in your repo.
5. **Show the cards in your README.** With the default `auto` theme, a `<picture>` follows GitHub's own light or dark setting:

```html
<picture>
  <source media="(prefers-color-scheme: dark)" srcset="git-info-combine/heatmap-dark.svg">
  <img alt="Contributions on GitHub and GitLab" src="git-info-combine/heatmap-light.svg">
</picture>
```

Each card has three files: `<card>.svg` (follows the viewer's system setting), `<card>-light.svg` and `<card>-dark.svg`. Pin and gist files are named after what they show: `pins: Kingpin-Apps/git-info-combine` writes `pin-github-kingpin-apps-git-info-combine.svg`.

The first run reads your whole history and can take a few minutes. Later runs use the cache and only fetch what changed.

## How things are counted

- **Contributions** (the heatmap) are GitHub's own contribution calendar plus GitLab's events, counted the way GitLab's calendar counts them.
- **Commits** are your commits on each repo's default branch: GitHub's commit contributions, and on GitLab, each project's contributor list matched to all of your GitLab emails and your name.
- **Languages** count every repo once, split by its languages (`languages-weighting: repo`). GitLab reports only percentages, not bytes, so this keeps both hosts in the same unit. `languages-weighting: size` weighs by size instead, so big repos dominate.
- **WordPress sites** that bundle WordPress core (at the root, or in `wordpress/`, `public/`, `public_html/` or Bedrock's `web/wp/`) count as one PHP repo: WordPress's own code is not counted as yours. Turn this off with `detect-wordpress: false`.
- **Mirrors.** A GitLab project whose latest commit matches one of your GitHub repos is a mirror, and is counted once. Name others with `gitlab-mirrors`.
- **Languages and stars** come from repos you own or are an organisation member of on GitHub (`include-org-repos`), and from projects you maintain on GitLab. Forks are skipped.
- The **rank** uses [GitHub Stats Extended](https://github.com/stats-organization/github-stats-extended)'s formula on the combined numbers.

## Privacy

- Private repos, projects and their activity are **counted**, but their **names are never written** to the cards, the cache or the logs. A check refuses to write output that contains one.
- Tokens stay in your repo's secrets and are only used inside the Action run.
- The cache (`cache.json`) holds daily counts and opaque ids, nothing else. A self-hosted GitLab's address is stored only as a hash.
- Pins and gists must be public; private repos, internal projects and secret gists are refused.
- WakaTime's project names are dropped; only languages and time are used.
- `exclude-repos` and `gitlab-mirrors` are the exceptions you control: your workflow file is public, so naming a private repo there reveals its name.

## Inputs

All inputs are optional except at least one token. See [`action.yml`](action.yml) for the full descriptions.

| Area | Inputs |
|---|---|
| Sources | `github-token`, `gitlab-token`, `gitlab-url`, `include-org-repos`, `exclude-repos`, `gitlab-mirrors`, `detect-wordpress`, `wakatime-api-key`, `wakatime-url`, `pins`, `gists` |
| Output | `cards`, `output-dir`, `commit`, `commit-message`, `equal-heights`, `layout`, `layout-width`, `layout-gap` |
| Look | `theme` (`auto` or any [GitHub Stats Extended theme](https://github.com/stats-organization/github-stats-extended/blob/master/apps/frontend/src/content/docs/docs/customization/themes.md)), `hide-title`, `hide-border`, `border-radius`, `title-color`, `icon-color`, `text-color`, `bg-color`, `border-color`, `github-color`, `gitlab-color` |
| Stats | `name`, `stats-hide`, `hide-rank`, `show-hosts`, `number-format` |
| Languages | `languages-layout`, `languages-count`, `languages-hide`, `languages-weighting` |
| Heatmap | `heatmap-range` (`last-year` or `all`), `heatmap-mode` (`hosts` or `single`) |
| WakaTime | `wakatime-range`, `wakatime-layout`, `wakatime-count`, `wakatime-hide` |

## Good to know

- **Tokens expire.** When your GitHub or GitLab token expires, runs fail. Set a reminder to renew it.
- **Scheduled workflows pause** after 60 days without activity in a repo. The cards change every run, so their commits normally keep the schedule alive.

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

[MIT](LICENSE) © Kingpin Apps
