const localEnvironment = {
  server: 'localhost',
  schema: 'dbo',
  database: 'your_database_name',
  user: 'your_database_user',
  password: 'your_database_password',
  roster_server: 'localhost',
  roster_schema: 'dbo',
  roster_database: 'your_roster_database_name',
  roster_user: 'your_roster_user',
  roster_password: 'your_roster_password',
  ALLOW_HARDCODED_IDENTITY_FALLBACK: 'true',
  API_PORT: '3002',
  PORT: '8080'
};

export default localEnvironment;
