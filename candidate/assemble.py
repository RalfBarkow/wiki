#!/usr/bin/env python3
"""Reconstruct P41 inputs from hash-verified sources; never read vendor/packages."""
import argparse
import base64
import gzip
import hashlib
import io
import json
import os
from pathlib import Path
import subprocess
import tarfile
import tempfile

HERE = Path(__file__).resolve().parent
COMPONENTS = {
    'wiki-server': 'server-upstream',
    'wiki-client': 'client-upstream',
    'wiki-plugin-journalmatic': 'journalmatic-upstream',
    'wiki-plugin-mech': 'mech',
    'wiki-plugin-solo': 'solo',
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def extract(archive, destination, expected):
    data = archive.read_bytes()
    sri = 'sha256-' + base64.b64encode(hashlib.sha256(data).digest()).decode()
    if sri != expected:
        raise ValueError(f'Source hash mismatch: {archive.name}')
    destination.mkdir()
    with tarfile.open(fileobj=io.BytesIO(data)) as tf:
        prefixes = {Path(m.name).parts[0] for m in tf if Path(m.name).parts}
        if len(prefixes) != 1:
            raise ValueError('Expected exactly one archive root')
        for member in tf:
            parts = Path(member.name).parts
            if len(parts) < 2:
                continue
            if member.issym() or member.islnk() or not (member.isfile() or member.isdir()):
                raise ValueError(f'Unexpected archive member: {member.name}')
            member.name = str(Path(*parts[1:]))
            tf.extract(member, destination, filter='data')


def files(tree):
    return [p for p in sorted(tree.rglob('*')) if p.is_file()
            and '.git' not in p.relative_to(tree).parts
            and 'node_modules' not in p.relative_to(tree).parts
            and p.name != 'package-lock.json']


def tree_manifest(tree):
    return {str(p.relative_to(tree)): {'sha256': digest(p.read_bytes()),
            'mode': 0o755 if p.stat().st_mode & 0o111 else 0o644} for p in files(tree)}


def pack(tree):
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode='w', format=tarfile.PAX_FORMAT) as tf:
        for p in files(tree):
            data = p.read_bytes()
            info = tarfile.TarInfo('package/' + str(p.relative_to(tree)))
            info.size = len(data)
            info.mode = 0o755 if p.stat().st_mode & 0o111 else 0o644
            info.mtime = 1
            tf.addfile(info, io.BytesIO(data))
    # Python >=3.13 uses an OS-neutral gzip header. Timestamp/name/ownership fixed.
    return gzip.compress(buffer.getvalue(), compresslevel=9, mtime=0)


def apply_patch(tree, patch):
    command = ['git', 'apply', '--unidiff-zero', '--whitespace=error-all']
    subprocess.run(command + ['--check', str(patch)], cwd=tree, check=True)
    subprocess.run(command + [str(patch)], cwd=tree, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--sources', type=Path, help='Nix reconstructionSources output')
    parser.add_argument('--output', type=Path, default=Path('candidate/packages'))
    parser.add_argument('--report', type=Path)
    args = parser.parse_args()
    sources = args.sources
    if sources is None:
        sources = Path(subprocess.check_output(
            ['nix', 'build', '.#reconstructionSources', '--no-link', '--print-out-paths'],
            text=True).strip())
    pins = json.loads((HERE / 'source-inputs.json').read_text())
    expected_trees = json.loads((HERE / 'package-trees.json').read_text())
    provenance = json.loads((HERE / 'provenance.json').read_text())
    report = {'sourceHashesVerified': [], 'patches': {}, 'archives': {}}
    with tempfile.TemporaryDirectory(prefix='p41-assemble-') as tmp:
        root = Path(tmp)
        for name, pin in pins.items():
            extract(sources / name, root / name, pin['hash'])
            report['sourceHashesVerified'].append(name)
        # Production diffs are evidence only: prove they reproduce the pinned
        # personal tree, but never apply them on top of the candidate patches.
        for kind in ['server', 'client']:
            base = root / (kind + '-production-base')
            patch = HERE / ('production-' + kind + '.patch')
            apply_patch(base, patch)
            if tree_manifest(base) != tree_manifest(root / (kind + '-personal')):
                raise ValueError(f'Production evidence mismatch: {kind}')
            report['patches'][patch.name] = 'applies; matches personal source'
        outputs = {}
        for name, source in COMPONENTS.items():
            tree = root / source
            # Candidate diffs were generated on package trees (locks excluded).
            for lock in tree.rglob('package-lock.json'):
                lock.unlink()
            patch = HERE / (name + '.patch')
            if patch.exists():
                apply_patch(tree, patch)
                report['patches'][patch.name] = 'applies; matches candidate tree'
            if name == 'wiki-plugin-journalmatic':
                metadata = 'pages/about-journalmatic-plugin'
                if (tree / metadata).read_bytes() != (root / 'journalmatic-personal' / metadata).read_bytes():
                    raise ValueError('Journalmatic metadata differs from personal pin')
            manifest = tree_manifest(tree)
            if manifest != expected_trees[name]:
                missing = sorted(expected_trees[name].keys() - manifest.keys())
                extra = sorted(manifest.keys() - expected_trees[name].keys())
                changed = sorted(k for k in manifest.keys() & expected_trees[name].keys()
                                 if manifest[k] != expected_trees[name][k])
                raise ValueError(f'{name}: missing={missing}, extra={extra}, changed={changed}')
            archive = pack(tree)
            expected = provenance['components'][name]['archiveSha256']
            actual = digest(archive)
            if actual != expected:
                raise ValueError(f'{name}: archive hash {actual} != {expected}')
            outputs[name] = archive
            report['archives'][name] = {'expectedSha256': expected,
                'reconstructedSha256': actual, 'byteIdentical': True,
                'normalizedTreeEqual': True, 'files': len(manifest)}
        # Publish only after every source, patch, tree and archive passes.
        args.output.mkdir(parents=True, exist_ok=True)
        for name, data in outputs.items():
            target = args.output / (name + '.tgz')
            temporary = target.with_suffix('.tgz.tmp')
            temporary.write_bytes(data)
            os.replace(temporary, target)
    text = json.dumps(report, indent=2) + '\n'
    if args.report:
        args.report.write_text(text)
    print(text, end='')


if __name__ == '__main__':
    main()
