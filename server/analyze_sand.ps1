$hash = @{}
$causes = @{}
$dates = @{}

Get-Content -Encoding Unicode .\鐵砂.csv | Select-Object -First 5000 | ForEach-Object {
    $arr = $_ -split ','
    if ($arr.Count -ge 15) {
        $pk = $arr[3].Trim()
        $cause = $arr[12].Trim()
        $d = $arr[14].Trim()
        if ($pk -ne 'Pack' -and $pk -ne '') {
            $hash[$pk] = [int]$hash[$pk] + 1
        }
        if ($cause -ne 'Cause_Code' -and $cause -ne '') {
            $causes[$cause] = [int]$causes[$cause] + 1
        }
        if ($d -ne 'Change_Date' -and $d -ne '') {
            $dates[$d] = [int]$dates[$d] + 1
        }
    }
}

Write-Output "=== TOP PACK TYPES ==="
$hash.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 10 | ForEach-Object {
    Write-Output "$($_.Name): $($_.Value)"
}

Write-Output "=== TOP CAUSES ==="
$causes.GetEnumerator() | Sort-Object Value -Descending | Select-Object -First 6 | ForEach-Object {
    Write-Output "$($_.Name): $($_.Value)"
}

Write-Output "=== DATE SAMPLES ==="
$dates.GetEnumerator() | Select-Object -First 5 | ForEach-Object {
    Write-Output "$($_.Name): $($_.Value)"
}
