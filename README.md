# Library Desk

1. Load the database:  `mysql -u root -p < library_project.sql`
2. Install:            `npm install`
3. Run:                `DB_PASSWORD=yourpassword npm start`   (Windows PowerShell: `$env:DB_PASSWORD="yourpassword"; npm start`)
4. Open:               http://localhost:3000

Optional env vars: DB_HOST, DB_USER, DB_PASSWORD, DB_NAME, PORT.
