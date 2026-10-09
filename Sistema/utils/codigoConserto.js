const db = require('../db');

async function gerarCodigoConserto(conexao = db) {
  const [usados] = await conexao.query('SELECT codigo FROM conserto WHERE codigo IS NOT NULL');
  const ocupados = new Set(usados.map(linha => linha.codigo));

  if (ocupados.size >= 100000) {
    throw new Error('Não há mais códigos de conserto disponíveis.');
  }

  let codigo;
  do {
    codigo = String(Math.floor(Math.random() * 100000)).padStart(5, '0');
  } while (ocupados.has(codigo));

  return codigo;
}

module.exports = { gerarCodigoConserto };