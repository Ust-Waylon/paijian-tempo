const fs = require('node:fs');
const { version } = require('../package.json');

(async () => {
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Release version must be a stable semantic version');
  const tag = `v${version}`;
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  if (!repository || !token)
    throw new Error('GitHub release environment is missing');
  const response = await fetch(
    `https://api.github.com/repos/${repository}/releases/tags/${tag}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    },
  );
  if (response.status !== 404 && !response.ok)
    throw new Error(`Release lookup failed: HTTP ${response.status}`);
  const existing = response.ok ? await response.json() : null;
  const publish = !existing || existing.draft;
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntag=${tag}\npublish=${publish}\n`,
  );
  console.log(JSON.stringify({ version, tag, buildAndPublish: publish }));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
