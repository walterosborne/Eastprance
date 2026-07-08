IF OBJECT_ID(N'dbo.westmarch_dashboard_presets', N'U') IS NULL
BEGIN
    CREATE TABLE dbo.westmarch_dashboard_presets
    (
        MyID        NVARCHAR(32)  NOT NULL,
        NetworkID   NVARCHAR(64)  NOT NULL,
        UserName    NVARCHAR(255) NOT NULL,
        PresetSlot  TINYINT       NOT NULL,
        PresetName  NVARCHAR(100) NOT NULL,
        PresetState NVARCHAR(MAX) NOT NULL,
        CreatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_westmarch_dashboard_presets_CreatedAt DEFAULT SYSUTCDATETIME(),
        UpdatedAt   DATETIME2(0)  NOT NULL CONSTRAINT DF_westmarch_dashboard_presets_UpdatedAt DEFAULT SYSUTCDATETIME(),

        CONSTRAINT PK_westmarch_dashboard_presets
            PRIMARY KEY CLUSTERED (MyID, PresetSlot),

        CONSTRAINT CK_westmarch_dashboard_presets_PresetSlot
            CHECK (PresetSlot BETWEEN 1 AND 3),

        CONSTRAINT CK_westmarch_dashboard_presets_PresetState_IsJson
            CHECK (ISJSON(PresetState) = 1)
    );

    CREATE INDEX IX_westmarch_dashboard_presets_NetworkID
        ON dbo.westmarch_dashboard_presets (NetworkID, UpdatedAt DESC);
END;
