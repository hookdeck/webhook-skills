#!/usr/bin/env python3
"""
One-off migration: split providers.yaml into providers/<name>.yaml and move
the hand-curated README / marketplace.json text into each provider's
`catalog` block, so both files can be fully generated
(./scripts/generate-skills.sh sync).

Run from the repo root:  python3 scripts/skill-generator/migrations/split-providers.py
Re-runnable: it reads providers.yaml, README.md and marketplace.json as they
are. If more providers land on main before the switch merges, merge main in,
resolve the providers.yaml conflict by keeping main's version
(`git checkout --theirs providers.yaml`), restore README.md and
marketplace.json from main, re-run this script, then `git rm providers.yaml`
and `./scripts/generate-skills.sh sync`. It refuses to write anything unless
the split is lossless. Delete this script once the switch has merged.
"""
import json, os, re, sys
import yaml

ROOT = os.getcwd()
DEFAULT_REPO = 'https://github.com/hookdeck/webhook-skills'
DEFAULT_AUTHOR = {'name': 'Hookdeck', 'email': 'phil@hookdeck.com'}
# Keep in sync with README_BEGIN / README_END in scripts/skill-generator/lib/catalog.ts
BEGIN_MARKER = '<!-- BEGIN GENERATED: provider-skills. Edit providers/<name>.yaml (catalog.summary), not this table. -->'
END_MARKER = '<!-- END GENERATED: provider-skills -->'

src = open(f'{ROOT}/providers.yaml').read()
lines = src.split('\n')
parsed = {p['name']: p for p in yaml.safe_load(src)['providers']}

# --- Split the YAML text into per-entry blocks, keeping comments/scalars as written
starts = [i for i, l in enumerate(lines) if l.startswith('  - name: ')]
blocks = {}
for idx, s in enumerate(starts):
    e = starts[idx + 1] if idx + 1 < len(starts) else len(lines)
    body = lines[s:e]
    # Drop trailing blank lines and section-header comments between entries
    while body and (body[-1].strip() == '' or body[-1].startswith('  #')):
        body.pop()
    out = []
    for j, l in enumerate(body):
        if j == 0:
            out.append(l[len('  - '):])
        elif l.strip() == '':
            out.append('')
        else:
            assert l.startswith('    '), f'unexpected indent in {body[0]!r}: {l!r}'
            out.append(l[4:])
    name = body[0][len('  - name: '):].strip()
    blocks[name] = '\n'.join(out)
assert set(blocks) == set(parsed), 'block names differ from parsed names'

# --- Curated README rows (Provider Webhook Skills table only)
readme = open(f'{ROOT}/README.md').read().split('\n')
h = readme.index('### Provider Webhook Skills')
t = next(i for i in range(h, len(readme)) if readme[i].startswith('|'))
rows = {}
i = t + 2
while readme[i].startswith('|'):
    m = re.match(r'^\| \[(.+?)\]\((.+?)\) \| \[`([^`]+)`\]\(skills/\3/\) \| (.*) \|$', readme[i])
    assert m, f'unparsed README row: {readme[i]}'
    rows[m.group(3)] = {'name': m.group(1), 'url': m.group(2), 'summary': m.group(4)}
    i += 1

# --- Marketplace entries
manifest = json.load(open(f'{ROOT}/.claude-plugin/marketplace.json'))
plugins = {p['source']: p for p in manifest['plugins']}

def skill_frontmatter(d):
    t = open(f'{ROOT}/skills/{d}/SKILL.md').read()
    return yaml.safe_load(re.match(r'^---\n(.*?)\n---', t, re.S).group(1))

catalogs = {}
for name, p in parsed.items():
    skill = (p.get('testScenario') or {}).get('skillName') or f'{name}-webhooks'
    assert os.path.exists(f'{ROOT}/skills/{skill}/SKILL.md'), f'{name}: no skill {skill}'
    fm = skill_frontmatter(skill)
    cat = {}
    row = rows.get(skill)
    if row:
        cat['summary'] = row['summary']
        if row['name'] != p.get('displayName'):
            cat['displayName'] = row['name']
        if row['url'] != (p.get('docs') or {}).get('webhooks'):
            cat['docsUrl'] = row['url']
    else:
        cat['readme'] = False  # listed in a hand-written README section
    e = plugins[f'./skills/{skill}']
    repo = (fm.get('metadata') or {}).get('repository') or DEFAULT_REPO
    assert e['name'] == fm['name'] == skill
    assert e['strict'] is False and e['skills'] == ['./']
    assert e['license'] == (fm.get('license') or 'MIT')
    assert e['author'] == DEFAULT_AUTHOR and e['repository'] == repo
    assert e['homepage'] == f'{repo}/tree/main/skills/{skill}'
    mk = {}
    if e['description'] != re.sub(r'\s+', ' ', fm.get('description', '')).strip():
        mk['description'] = e['description']
    default_kw = list(dict.fromkeys(['webhooks', *[w for w in skill.removesuffix('-webhooks').split('-') if w]]))
    if e['keywords'] != default_kw:
        mk['keywords'] = e['keywords']
    if e['category'] != 'integration':
        mk['category'] = e['category']
    if mk:
        cat['marketplace'] = mk
    catalogs[name] = (skill, cat)

# Every README row must map to a provider entry
mapped = {s for s, _ in catalogs.values()}
missing_rows = set(rows) - mapped
assert not missing_rows, f'README rows without a providers.yaml entry: {missing_rows}'

# --- Curated base for plugins without a provider entry (non-provider skills + bundle)
base_plugins = [p for p in manifest['plugins'] if p['source'] == './' or p['source'].removeprefix('./skills/') not in mapped]
bundle = next(p for p in base_plugins if p['source'] == './')
provider_count = sum(1 for _, c in catalogs.values() if c.get('readme') is not False)
skill_count = len([d for d in os.listdir(f'{ROOT}/skills') if os.path.exists(f'{ROOT}/skills/{d}/SKILL.md')])
bundle['description'] = re.sub(r'\b\d+ provider skills \(Stripe, Shopify, GitHub, and \d+ others\)',
                               '{providerCount} provider skills (Stripe, Shopify, GitHub, and {otherProviderCount} others)', bundle['description'])
bundle['description'] = re.sub(r'all \d+ skills', 'all {skillCount} skills', bundle['description'])
bundle['skills'] = '{allSkills}'
meta = dict(manifest['metadata'])
meta['description'] = re.sub(r'and \d+\+ others', 'and {otherProviderCount} others', meta['description'])
base = {'name': manifest['name'], 'owner': manifest['owner'], 'metadata': meta, 'plugins': base_plugins}

# --- Write
os.makedirs(f'{ROOT}/providers', exist_ok=True)
for name, (skill, cat) in catalogs.items():
    text = blocks[name] + '\n' + yaml.safe_dump({'catalog': cat}, sort_keys=False, allow_unicode=True, width=100000)
    # Lossless check: the file parses back to the original entry plus catalog
    back = yaml.safe_load(text)
    assert back.pop('catalog') == cat and back == parsed[name], f'{name}: split is not lossless'
    open(f'{ROOT}/providers/{name}.yaml', 'w').write(text)
json.dump(base, open(f'{ROOT}/scripts/skill-generator/marketplace.base.json', 'w'), indent=2, ensure_ascii=False)
open(f'{ROOT}/scripts/skill-generator/marketplace.base.json', 'a').write('\n')

# Wrap the provider table in generated-section markers (contents are rewritten by sync)
readme_lines = open(f'{ROOT}/README.md').read().split('\n')
if BEGIN_MARKER not in readme_lines:
    h = readme_lines.index('### Provider Webhook Skills')
    t = next(i for i in range(h, len(readme_lines)) if readme_lines[i].startswith('|'))
    e = t
    while readme_lines[e].startswith('|'):
        e += 1
    readme_lines[t:e] = [BEGIN_MARKER, *readme_lines[t:e], END_MARKER]
    open(f'{ROOT}/README.md', 'w').write('\n'.join(readme_lines))

print(f'wrote {len(catalogs)} provider files, {len(base_plugins)} base plugins; '
      f'{provider_count} README provider rows, {skill_count} skills')
