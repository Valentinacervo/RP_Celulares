require('dotenv').config(); // Carrega as variáveis do arquivo .env
const mysql = require('mysql2');

// Aiven exige SSL. O certificado (CA) vem da variável DB_CA (conteúdo do ca.pem).
// Se DB_CA não existir (ex.: banco local), conecta sem SSL.
const ssl = process.env.DB_CA
    ? { ca: process.env.DB_CA.replace(/\\n/g, '\n'), rejectUnauthorized: true }
    : undefined;

const pool = mysql.createPool({
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    ssl,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool.promise();