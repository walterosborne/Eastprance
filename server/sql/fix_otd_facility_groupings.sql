/*
  Facility aliases for OTD.
  Preview by default. Set @ApplyChanges = 1 to apply the proposed corrections.
  Updates only three original facility aliases in qmi.facilitygroupings.
*/
SET NOCOUNT ON;
SET XACT_ABORT ON;

DECLARE @ApplyChanges bit = 0;

IF OBJECT_ID(N'ecosystem_source.qmi.facilitygroupings', N'U') IS NULL
    THROW 50001, 'Facility grouping table not found.', 1;

DECLARE @Changes table (
    [Original] nvarchar(255) NOT NULL PRIMARY KEY,
    [Group] nvarchar(255) NOT NULL,
    [ExpectedPreviousGroup] nvarchar(255) NULL
);

INSERT INTO @Changes ([Original], [Group], [ExpectedPreviousGroup])
VALUES
    (N'ABL', N'Rocket Center', N'Edwards AFB'),
    (N'EPIC', N'Huntsville', N'Elkton'),
    (N'110 Wynn Dr', N'Huntsville', NULL);

-- Preview any existing mappings and the proposed changes.
SELECT
    c.[Original] AS [Original],
    current_map.[Group] AS [Current Group],
    c.[Group] AS [Proposed Group],
    CASE
        WHEN current_map.[Original] IS NULL THEN N'Insert alias'
        WHEN LTRIM(RTRIM(current_map.[Group])) = c.[Group] THEN N'Already correct'
        ELSE N'Update mapping'
    END AS [Action]
FROM @Changes AS c
LEFT JOIN [ecosystem_source].[qmi].[facilitygroupings] AS current_map
    ON LOWER(LTRIM(RTRIM(current_map.[Original]))) COLLATE DATABASE_DEFAULT
     = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
ORDER BY c.[Original];

IF @ApplyChanges = 0
BEGIN
    PRINT 'Preview only. Set @ApplyChanges = 1 to apply these changes.';
    RETURN;
END;

BEGIN TRY
    BEGIN TRANSACTION;

    IF EXISTS (
        SELECT 1
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS f
        JOIN @Changes AS c
            ON LOWER(LTRIM(RTRIM(f.[Original]))) COLLATE DATABASE_DEFAULT
             = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
        GROUP BY c.[Original]
        HAVING COUNT(*) > 1
    )
        THROW 50002, 'Duplicate facility aliases found. Resolve them before updating.', 1;

    IF EXISTS (
        SELECT 1
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS f
        JOIN @Changes AS c
            ON LOWER(LTRIM(RTRIM(f.[Original]))) COLLATE DATABASE_DEFAULT
             = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
        WHERE
            LTRIM(RTRIM(f.[Group])) COLLATE DATABASE_DEFAULT
                <> c.[Group] COLLATE DATABASE_DEFAULT
            AND (
                c.[ExpectedPreviousGroup] IS NULL
                OR LTRIM(RTRIM(f.[Group])) COLLATE DATABASE_DEFAULT
                    <> c.[ExpectedPreviousGroup] COLLATE DATABASE_DEFAULT
            )
    )
        THROW 50003, 'An alias has an unexpected existing mapping. Review before applying.', 1;

    UPDATE f
       SET f.[Group] = c.[Group]
    FROM [ecosystem_source].[qmi].[facilitygroupings] AS f
    JOIN @Changes AS c
        ON LOWER(LTRIM(RTRIM(f.[Original]))) COLLATE DATABASE_DEFAULT
         = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
    WHERE LTRIM(RTRIM(f.[Group])) COLLATE DATABASE_DEFAULT
          <> c.[Group] COLLATE DATABASE_DEFAULT;

    INSERT INTO [ecosystem_source].[qmi].[facilitygroupings] ([Original], [Group])
    SELECT c.[Original], c.[Group]
    FROM @Changes AS c
    WHERE NOT EXISTS (
        SELECT 1
        FROM [ecosystem_source].[qmi].[facilitygroupings] AS f WITH (UPDLOCK, HOLDLOCK)
        WHERE LOWER(LTRIM(RTRIM(f.[Original]))) COLLATE DATABASE_DEFAULT
             = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
    );

    COMMIT TRANSACTION;

    SELECT f.[Original], f.[Group]
    FROM [ecosystem_source].[qmi].[facilitygroupings] AS f
    JOIN @Changes AS c
        ON LOWER(LTRIM(RTRIM(f.[Original]))) COLLATE DATABASE_DEFAULT
         = LOWER(c.[Original]) COLLATE DATABASE_DEFAULT
    ORDER BY f.[Original];
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
