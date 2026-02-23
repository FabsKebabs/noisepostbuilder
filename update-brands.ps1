# Run this script whenever you add new brands, batches, or images.
# It scans the Brands/ folder and regenerates brands.json

$root   = Join-Path $PSScriptRoot "Brands"
$imgExt = @('.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov')

$brands = @()
foreach ($brandDir in Get-ChildItem $root -Directory | Sort-Object Name) {
    $batches = @()
    foreach ($batchDir in Get-ChildItem $brandDir.FullName -Directory | Sort-Object Name) {
        $files = Get-ChildItem $batchDir.FullName -File |
                 Where-Object { $imgExt -contains $_.Extension.ToLower() } |
                 Sort-Object Name |
                 Select-Object -ExpandProperty Name
        $batches += [PSCustomObject]@{ name = $batchDir.Name; files = @($files) }
    }
    $brands += [PSCustomObject]@{ name = $brandDir.Name; batches = $batches }
}

$out = [PSCustomObject]@{ brands = $brands } | ConvertTo-Json -Depth 5
$out | Out-File -FilePath (Join-Path $PSScriptRoot "brands.json") -Encoding utf8

Write-Host "✅ brands.json updated!" -ForegroundColor Green
Write-Host "   Brands: $($brands.Count)"
foreach ($b in $brands) {
    Write-Host "   • $($b.name): $($b.batches.Count) batch(es)"
}
