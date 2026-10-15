const db = require('../db');

async function anexarUltimoServico(clientes) {
  clientes.forEach(cliente => {
    cliente.ultimo_servico = null;
  });

  if (clientes.length === 0) return clientes;

  const ids = clientes.map(cliente => cliente.id_cliente);

  // Conserto mais recente de cada cliente
  const [consertos] = await db.query(
    `SELECT c.id_cliente,
            c.tipo_conserto AS descricao,
            DATE_FORMAT(c.data_solicitada, '%Y-%m-%d') AS data_iso,
            DATE_FORMAT(c.data_solicitada, '%d/%m/%Y') AS data
     FROM conserto c
     WHERE c.id_cliente IN (?)
       AND NOT EXISTS (
         SELECT 1 FROM conserto c2
         WHERE c2.id_cliente = c.id_cliente
           AND (c2.data_solicitada > c.data_solicitada
                OR (c2.data_solicitada = c.data_solicitada AND c2.id_conserto > c.id_conserto))
       )`,
    [ids]
  );

  const maisRecente = new Map();

  consertos.forEach(linha => {
    maisRecente.set(linha.id_cliente, {
      tipo: 'Conserto',
      descricao: linha.descricao || 'Serviço',
      data: linha.data,
      data_iso: linha.data_iso
    });
  });

  clientes.forEach(cliente => {
    cliente.ultimo_servico = maisRecente.get(cliente.id_cliente) || null;
  });

  return clientes;
}

module.exports = { anexarUltimoServico };