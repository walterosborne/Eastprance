IF OBJECT_ID(N'qmi.businessunits', N'U') IS NULL
    CREATE TABLE [qmi].[businessunits] (
        [Id] int IDENTITY(1,1) NOT NULL PRIMARY KEY,
        [Name] nvarchar(255) NOT NULL UNIQUE
    );
IF OBJECT_ID(N'qmi.bugroupings', N'U') IS NULL
    CREATE TABLE [qmi].[bugroupings] (
        [Original] nvarchar(255) NOT NULL PRIMARY KEY,
        [BusinessUnitId] int NOT NULL REFERENCES [qmi].[businessunits] ([Id])
    );
-- Replace these example values with actual BU names and source values.
INSERT INTO [qmi].[businessunits] ([Name]) VALUES (N'Proper BU Name');
INSERT INTO [qmi].[bugroupings] ([Original], [BusinessUnitId])
SELECT source.[Original], bu.[Id]
FROM (VALUES
    (N'Original BU 1', N'Proper BU Name'),
    (N'Original BU 2', N'Proper BU Name')
) AS source ([Original], [Name])
INNER JOIN [qmi].[businessunits] AS bu ON bu.[Name] = source.[Name];
