$ErrorActionPreference = 'Stop'
$recallRoot = Split-Path -Parent $PSScriptRoot
$env:RUSTUP_HOME = Join-Path $recallRoot 'tools\rustup'
$env:CARGO_HOME = Join-Path $recallRoot 'tools\cargo'
& (Join-Path $env:CARGO_HOME 'bin\rustup.exe') target add wasm32-unknown-unknown
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& (Join-Path $env:CARGO_HOME 'bin\rustc.exe') (Join-Path $PSScriptRoot 'fsrs7-core.rs') --edition=2021 --crate-type cdylib --target wasm32-unknown-unknown -C opt-level=3 -C panic=abort -C strip=symbols -o (Join-Path $recallRoot 'public\fsrs7.wasm')
exit $LASTEXITCODE


