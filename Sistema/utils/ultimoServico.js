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

  // Compra mais recente de cada cliente
  const [compras] = await db.query(
    `SELECT c.id_cliente,
            p.nome AS descricao,
            DATE_FORMAT(c.data_compra, '%Y-%m-%d') AS data_iso,
            DATE_FORMAT(c.data_compra, '%d/%m/%Y') AS data
     FROM compra c
     LEFT JOIN produto p ON p.id_produto = c.id_produto
     WHERE c.id_cliente IN (?)
       AND NOT EXISTS (
         SELECT 1 FROM compra c2
         WHERE c2.id_cliente = c.id_cliente
           AND (c2.data_compra > c.data_compra
                OR (c2.data_compra = c.data_compra AND c2.id_compra > c.id_compra))
       )`,
    [ids]
  );

  const maisRecente = new Map();

  function considerar(linha, tipo) {
    const atual = maisRecente.get(linha.id_cliente);

    // Em caso de dois ao mesmo tempo, vale o conserto
    if (!atual || (linha.data_iso || '') > (atual.data_iso || '')) {
      maisRecente.set(linha.id_cliente, {
        tipo,
        descricao: linha.descricao || (tipo === 'Compra' ? 'Produto' : 'Serviço'),
        data: linha.data,
        data_iso: linha.data_iso
      });
    }
  }

  consertos.forEach(linha => considerar(linha, 'Conserto'));
  compras.forEach(linha => considerar(linha, 'Compra'));

  clientes.forEach(cliente => {
    cliente.ultimo_servico = maisRecente.get(cliente.id_cliente) || null;
  });

  return clientes;
}

module.exports = { anexarUltimoServico };