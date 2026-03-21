# Pitfalls Handbook

## Known Pitfalls
- `setup.sh` can abort in wrapper setup when alias targets resolve to the same file path and `cp` attempts to copy a file onto itself under `set -e`. Guard wrapper copies with a distinct-path check.
