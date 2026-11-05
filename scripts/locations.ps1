$recallRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$recallInstalled = Test-Path -LiteralPath (Join-Path $recallRoot '.recall-installed') -PathType Leaf
$recallStateRoot = if ($recallInstalled) { Split-Path -Parent $recallRoot } else { $recallRoot }
$recallDataDirectory = if ($env:RECALL_DATA_DIR) { [IO.Path]::GetFullPath($env:RECALL_DATA_DIR) } else { Join-Path $recallStateRoot 'data' }
$recallCertDirectory = if ($env:RECALL_CERTS_DIR) { [IO.Path]::GetFullPath($env:RECALL_CERTS_DIR) } else { Join-Path $recallStateRoot 'certs' }
