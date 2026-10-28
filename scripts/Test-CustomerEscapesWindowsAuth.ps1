#Requires -Version 5.1
<#
.SYNOPSIS
  Tests Windows Authentication and read access to the three Quality Data Mart
  tables used by the QMI Customer Escapes card.
.DESCRIPTION
  Uses the Windows network credentials of the PowerShell process (Integrated
  Security / SSPI). No YY password is accepted, read, stored, or logged.
  Runs SELECT-only queries. Source rows are never displayed or written to disk.
  This is a standalone diagnostic; it does not start or modify QMI.
.EXAMPLE
  .\scripts\Test-CustomerEscapesWindowsAuth.ps1 -Server "your-sql-host"
#>
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidateNotNullOrEmpty()]
    [string] $Server,

    [Parameter()]
    [ValidateNotNullOrEmpty()]
    [string] $Database = 'Quality Data Mart'
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Data

function Get-SqlErrorSummary {
    param([System.Exception] $Exception)
    $current = $Exception
    while ($null -ne $current) {
        if ($current -is [System.Data.SqlClient.SqlException]) {
            return ("SQL error {0}: {1}" -f $current.Number, $current.Message)
        }
        $current = $current.InnerException
    }
    return $Exception.Message
}

# Read-only, exact table-and-column checks derived from the existing
# server/customerEscapesRepository.js SQL query.
$checks = @(
    @{
        Name = 'Program monthly history'
        Query = @'
SELECT TOP (1)
    [PMDH_PROG_ID], [PMDH_DATV_ID], [PMDH_Data_Value],
    [PMDH_MYDT_ID], [PMDH_PCMY_ID], [PMDH_Level]
FROM [QAF_RawData].[PMDH_Program_MonthYear_Data_History];
'@
    },
    @{
        Name = 'Month-year dimension'
        Query = @'
SELECT TOP (1) [MYDT_ID], [MYDT_From_DT]
FROM [QAF_RawData].[MYDT_Month_Year_Date];
'@
    },
    @{
        Name = 'Program configuration'
        Query = @'
SELECT TOP (1)
    [PCMY_ID], [PCMY_PROG_Division], [PCMY_PROG_BusinessUnit],
    [PCMY_Status], [PCMY_PROG_Sector]
FROM [QAF_RawData].[PCMY_Program_Configuration_Month_Year];
'@
    }
)

$builder = New-Object System.Data.SqlClient.SqlConnectionStringBuilder
$builder['Data Source'] = $Server
$builder['Initial Catalog'] = $Database
$builder['Integrated Security'] = $true
$builder['Encrypt'] = $true
# Match the existing QMI connection's internal SQL certificate policy.
# Prefer a properly trusted SQL certificate before production use.
$builder['TrustServerCertificate'] = $true
$builder['Connect Timeout'] = 15
$builder['Application Name'] = 'QMI-Customer-Escapes-Auth-Check'

$connection = New-Object System.Data.SqlClient.SqlConnection($builder.ConnectionString)
$failures = 0

Write-Host "Quality Data Mart - Windows Authentication check"
Write-Host "Target: $Server / $Database"
Write-Host 'Credentials: current process Windows/network identity (no password passed)'
Write-Host ''

try {
    try {
        $connection.Open()
        Write-Host '[PASS] Connected to SQL Server using Windows Authentication.'

        $command = $connection.CreateCommand()
        try {
            $command.CommandText = @'
SELECT
    ORIGINAL_LOGIN() AS login_name,
    SYSTEM_USER AS system_user,
    DB_NAME() AS database_name,
    CONVERT(varchar(40), CONNECTIONPROPERTY('auth_scheme')) AS auth_scheme;
'@
            $command.CommandTimeout = 20
            $reader = $command.ExecuteReader()
            try {
                if ($reader.Read()) {
                    $login = [string] $reader['login_name']
                    $scheme = [string] $reader['auth_scheme']
                    $actualDb = [string] $reader['database_name']
                    Write-Host "  SQL login: $login"
                    Write-Host "  Authentication scheme: $scheme"
                    Write-Host "  Database: $actualDb"
                }
            } finally {
                $reader.Dispose()
            }
        } finally {
            $command.Dispose()
        }
    } catch {
        $failures++
        Write-Host ("[FAIL] Authentication or database connection: {0}" -f (Get-SqlErrorSummary $_.Exception))
        Write-Host 'The three table checks were skipped because the connection failed.'
        exit 1
    }

    # Execute every query but discard all results. This checks column-level
    # access as well as table names, while reading at most one source row.
    foreach ($check in $checks) {
        $command = $connection.CreateCommand()
        try {
            $command.CommandText = $check.Query
            $command.CommandTimeout = 20
            $reader = $command.ExecuteReader()
            try {
                [void] $reader.Read()
            } finally {
                $reader.Dispose()
            }
            Write-Host ("[PASS] SELECT: {0}" -f $check.Name)
        } catch {
            $failures++
            Write-Host ("[FAIL] SELECT: {0} -- {1}" -f $check.Name, (Get-SqlErrorSummary $_.Exception))
        } finally {
            $command.Dispose()
        }
    }
} finally {
    $connection.Dispose()
}

Write-Host ''
if ($failures -eq 0) {
    Write-Host 'RESULT: Windows Authentication and all three Customer Escapes source checks succeeded.'
    exit 0
} else {
    Write-Host ("RESULT: {0} check(s) failed. Share the error text, but redact account names if needed." -f $failures)
    exit 1
}
