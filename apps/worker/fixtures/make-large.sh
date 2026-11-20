#!/usr/bin/env bash
# Writes fixtures/large-26mib.eml (git-ignored): a 26 MiB message for the size-limit check.
set -euo pipefail
out="$(dirname "$0")/large-26mib.eml"
{
  printf 'From: sender@agency.example\r\nTo: owner@agency.example\r\nSubject: Large attachment\r\nMIME-Version: 1.0\r\nContent-Type: text/plain\r\n\r\n'
  head -c $((26 * 1024 * 1024)) /dev/zero | tr '\0' 'a'
} > "$out"
echo "$out"
