IF OBJECT_ID(N'qmi.bugroupings', N'U') IS NULL
BEGIN
    CREATE TABLE [qmi].[bugroupings] (
        [Original] nvarchar(255) NOT NULL PRIMARY KEY,
        [Group] nvarchar(255) NOT NULL
    );
END;
-- Replace these example values with the actual BU names and group titles.
INSERT INTO [qmi].[bugroupings] ([Original], [Group])
VALUES (N'Original BU 1', N'Proper BU Name'),
       (N'Original BU 2', N'Proper BU Name');
