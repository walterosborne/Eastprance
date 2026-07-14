/*
  Set this to the same schema value you provide to the app via env
  (`schema` / `SQL_SCHEMA`) before running the script.
*/
DECLARE @SchemaName SYSNAME = N'dbo';
DECLARE @QualifiedTableName NVARCHAR(258) = QUOTENAME(@SchemaName) + N'.[dashboard_presets]';
DECLARE @Sql NVARCHAR(MAX);

IF SCHEMA_ID(@SchemaName) IS NULL
BEGIN
    SET @Sql = N'CREATE SCHEMA ' + QUOTENAME(@SchemaName) + N';';
    EXEC sys.sp_executesql @Sql;
END;

IF OBJECT_ID(@QualifiedTableName, N'U') IS NULL
BEGIN
    SET @Sql = N'
        CREATE TABLE ' + @QualifiedTableName + N'
        (
            MyID        NVARCHAR(32)  NOT NULL,
            NetworkID   NVARCHAR(64)  NOT NULL,
            UserName    NVARCHAR(255) NOT NULL,
            PresetSlot  TINYINT       NOT NULL,
            PresetName  NVARCHAR(100) NOT NULL,
            PresetState NVARCHAR(MAX) NOT NULL,
            CreatedAt   DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
            UpdatedAt   DATETIME2(0)  NOT NULL DEFAULT SYSUTCDATETIME(),
            PRIMARY KEY CLUSTERED (MyID, PresetSlot),
            CHECK (PresetSlot BETWEEN 1 AND 3),
            CHECK (ISJSON(PresetState) = 1)
        );
    ';

    EXEC sys.sp_executesql @Sql;

    SET @Sql = N'
        CREATE INDEX [IX_dashboard_presets_NetworkID]
            ON ' + @QualifiedTableName + N' (NetworkID, UpdatedAt DESC);
    ';

    EXEC sys.sp_executesql @Sql;
END;
