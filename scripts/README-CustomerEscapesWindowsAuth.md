# Customer Escapes: Windows Authentication access check

This **standalone PowerShell 5.1** diagnostic checks whether the YY account can
open the **Quality Data Mart** database and SELECT from the **three exact**
tables and columns currently queried by QMI's
`server/customerEscapesRepository.js`.

It uses native Windows integrated authentication (SSPI), not SQL login or a
Node driver. It does not require VS Code to run as YY, does not ask for or store
a password, does not upload data, and does not modify the database.

## Start only the test shell using YY's network credentials

While signed into Windows normally, open **Command Prompt** and run:

```cmd
runas /netonly /user:DOMAIN\YY_USERNAME "powershell.exe -NoProfile"
```

Type the YY password at Windows' password prompt. This starts a separate
PowerShell process with YY **network credentials**. VS Code and the rest of
your desktop stay under your usual account. Your local `whoami` may still
show your personal account because `/netonly` changes network credentials,
not the local process identity; the script prints SQL Server's
`ORIGINAL_LOGIN()` to verify what identity actually reached SQL.

If your organization blocks `runas /netonly` or the account is not allowed
to log on that way, have your Windows administrator run the script in a
short-lived, approved scheduled task under the YY identity. Do not weaken
domain security settings.

## Run the diagnostic

In the new PowerShell window, change directory to the root of the QMI repo,
then run (substitute your actual SQL Server hostname):

```powershell
.\scripts\Test-CustomerEscapesWindowsAuth.ps1 -Server "YOUR_SQL_SERVER_FQDN"
```

Database defaults to `Quality Data Mart`; use
`-Database "Quality Data Mart"` to make it explicit. The script uses the
built-in Windows PowerShell 5.1 `System.Data.SqlClient` provider, so it
does not need Node, VS Code, or an external ODBC installation. It uses an
encrypted SQL connection with `TrustServerCertificate=true`, matching
QMI's existing internal SQL connection policy; use a trusted certificate
before production.

The output shows:

- SQL login (`ORIGINAL_LOGIN()`) and the negotiated authentication scheme
  (`KERBEROS` or `NTLM`);
- Whether connection to the Quality Data Mart database succeeded;
- PASS/FAIL for each of the three QAF_RawData tables and required columns.

Each table check runs a `SELECT TOP (1)` query and **discards** the row;
no customer data or credentials are printed or saved. Failure returns a
nonzero exit code.

### Interpreting results

- **Connection fails:** YY authentication, domain trust, server name,
  database permissions, or network access must be resolved first.
- **Connection succeeds, table check fails:** request appropriate read-only
  access to the reported table/columns from the DBA.
- **All checks pass, auth scheme KERBEROS:** YY works with Kerberos on Windows.
  OpenShift still needs a working Linux Kerberos/ODBC configuration and
  approved ticket provisioning; this Windows test does not establish that.
- **All checks pass, auth scheme NTLM:** YY has Windows-authenticated access,
  but a working Kerberos route remains unproven.

This file is a diagnostic only. It does not run QMI or grant permissions.
