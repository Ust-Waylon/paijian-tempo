const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { version } = require('../package.json');

(async () => {
  const repository = process.env.GITHUB_REPOSITORY;
  const token = process.env.GH_TOKEN;
  const commit = process.env.GITHUB_SHA;
  if (!repository || !token || !/^[0-9a-f]{40}$/.test(commit || ''))
    throw new Error('Invalid release environment');
  if (!/^\d+\.\d+\.\d+$/.test(version))
    throw new Error('Invalid release version');
  const tag = `v${version}`;
  const directory = path.resolve(process.argv[2] || 'release-assets');
  const names = [];
  for (const platform of ['win', 'mac'])
    for (const arch of ['x64', 'arm64'])
      for (const ext of [platform === 'win' ? 'exe' : 'dmg', 'zip'])
        names.push(`Paijian-Tempo-${version}-${platform}-${arch}.${ext}`);
  names.sort();
  const sums = [];
  for (const name of names) {
    const file = await fs.readFile(path.join(directory, name));
    if (file.length < 10000000)
      throw new Error(`Missing or unexpectedly small installer: ${name}`);
    sums.push(`${createHash('sha256').update(file).digest('hex')}  ${name}`);
  }
  await fs.writeFile(
    path.join(directory, 'SHA256SUMS.txt'),
    sums.join('\n') + '\n',
  );
  names.push('SHA256SUMS.txt');
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };
  async function request(route, method = 'GET', body) {
    const result = await fetch(
      `https://api.github.com/repos/${repository}${route}`,
      {
        method,
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );
    if (!result.ok)
      throw new Error(
        `GitHub ${method} ${route}: HTTP ${result.status}: ${await result.text()}`,
      );
    return result.status === 204 ? null : result.json();
  }
  const releases = await request('/releases?per_page=100');
  let release = releases.find((item) => item.tag_name === tag);
  if (release && !release.draft)
    throw new Error(
      `${tag} is already published; published assets are immutable. Bump the version to publish another build.`,
    );
  const body = [
    '## 下载安装 / Downloads',
    '',
    'Windows：运行对应架构的 `.exe` 安装程序；`.zip` 为免安装版。',
    'macOS：打开对应架构的 `.dmg`，将「拍间 Tempo」拖入 Applications；也提供 `.zip`。',
    '',
    '- `x64`：Intel / AMD Windows，或 Intel Mac。',
    '- `arm64`：Windows on ARM，或 Apple Silicon Mac（M 系列）。',
    '- 安装包无需 Node.js；无需账号或网络即可使用。',
    '',
    '四种架构均在对应系统的 GitHub runner 上通过源码测试、桌面检查和安装包启动检查。CI 使用静音音频输出验证音频信号与时钟，不模拟真实扬声器。',
    '',
    '本次发行版未使用受信任的开发者证书签名，Mac 未进行 Apple 公证。系统可能要求你确认开发者；确认下载来自本仓库后再继续。文件校验值见 `SHA256SUMS.txt`。',
    '',
    'Windows: use the matching `.exe` installer or extract the portable `.zip`. macOS: open the matching `.dmg` and drag the app to Applications, or use the `.zip`.',
    'No Node.js installation is needed. These community builds have no trusted publisher certificate or Apple notarization. SHA-256 checksums are included.',
    '',
    `Source commit: ${commit}`,
  ].join('\n');
  if (!release)
    release = await request('/releases', 'POST', {
      tag_name: tag,
      target_commitish: commit,
      name: `拍间 Tempo ${tag}`,
      body,
      draft: true,
      prerelease: false,
    });
  else
    release = await request(`/releases/${release.id}`, 'PATCH', {
      target_commitish: commit,
      body,
    });
  for (const name of names) {
    const existing = release.assets?.find((asset) => asset.name === name);
    if (existing) await request(`/releases/assets/${existing.id}`, 'DELETE');
    const upload = new URL(release.upload_url.replace(/\{.*$/, ''));
    if (upload.hostname !== 'uploads.github.com')
      throw new Error('Unexpected upload host');
    upload.searchParams.set('name', name);
    const bytes = await fs.readFile(path.join(directory, name));
    const result = await fetch(upload, {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/octet-stream',
        'Content-Length': String(bytes.length),
      },
      body: bytes,
    });
    if (!result.ok)
      throw new Error(
        `Upload ${name}: HTTP ${result.status}: ${await result.text()}`,
      );
    const asset = await result.json();
    if (asset.name !== name || asset.size !== bytes.length)
      throw new Error(`Upload size mismatch: ${name}`);
    console.log(`Uploaded ${name}`);
  }
  const uploaded = await request(`/releases/${release.id}/assets?per_page=100`);
  for (const name of names)
    if (
      !uploaded.some(
        (asset) => asset.name === name && asset.state === 'uploaded',
      )
    )
      throw new Error(`Unconfirmed release asset: ${name}`);
  release = await request(`/releases/${release.id}`, 'PATCH', {
    draft: false,
    make_latest: 'true',
  });
  console.log(`Published ${release.html_url}`);
  if (process.env.GITHUB_STEP_SUMMARY)
    await fs.appendFile(
      process.env.GITHUB_STEP_SUMMARY,
      `## Release ready\n\n[${tag}](${release.html_url}) — eight platform downloads and SHA-256 checksums.\n`,
    );
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
