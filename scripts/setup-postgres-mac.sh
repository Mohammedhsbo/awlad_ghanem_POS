#!/usr/bin/env bash
set -euo pipefail

version='16.15'
archive_name='postgresql-16.15-1-osx-binaries.tar.gz'
download_url='https://sbp.enterprisedb.com/getfile.jsp?fileid=1260512'
expected_sha256='B2CD6A98DF1FE0BD84FC9C76109C168A9C018C36A2DCA93E542B417237E6EECE'
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cache_root="$repo_root/.cache/postgres"
archive_path="$cache_root/$archive_name"
extract_root="$cache_root/extract-mac"
target_root="$repo_root/resources/postgres-binaries/darwin/x64"

[[ "$(uname -s)" == 'Darwin' ]] || { echo 'This setup script requires macOS.' >&2; exit 1; }
[[ "$(uname -m)" == 'x86_64' ]] || { echo "This setup script requires Intel x64. Detected: $(uname -m)" >&2; exit 1; }

mkdir -p "$cache_root"
if [[ ! -f "$archive_path" ]]; then
  curl --fail --location --retry 3 --output "$archive_path" "$download_url"
fi
actual_sha256="$(shasum -a 256 "$archive_path" | awk '{print toupper($1)}')"
[[ "$actual_sha256" == "$expected_sha256" ]] || { rm -f "$archive_path"; echo "Checksum mismatch: expected $expected_sha256, received $actual_sha256" >&2; exit 1; }

rm -rf "$extract_root" "$target_root"
mkdir -p "$extract_root" "$(dirname "$target_root")"
tar -xzf "$archive_path" -C "$extract_root"
source_root="$extract_root/pgsql"
for binary_name in initdb pg_ctl createdb postgres; do
  [[ -f "$source_root/bin/$binary_name" ]] || { echo "Archive is missing bin/$binary_name" >&2; exit 1; }
done
cp -R "$source_root" "$target_root"
chmod +x "$target_root"/bin/{initdb,pg_ctl,createdb,postgres}
echo "Installed PostgreSQL $version macOS Intel x64 binaries at $target_root"