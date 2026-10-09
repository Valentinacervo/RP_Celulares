const db = require('./db');
const { gerarCodigoCliente } = require('./utils/codigoCliente');

(async () => {
  const [clientes] = await db.query('SELECT id_cliente FROM cliente WHERE codigo IS NULL');

  for (const cliente of clientes) {
    const codigo = await gerarCodigoCliente();
    await db.query('UPDATE cliente SET codigo = ? WHERE id_cliente = ?', [codigo, cliente.id_cliente]);
  }

  console.log('Códigos gerados:', clientes.length);
  process.exit();
})();