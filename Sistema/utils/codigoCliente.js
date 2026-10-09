const db = require('../db');

async function gerarCodigoCliente() {
  const [usados] = await db.query('SELECT codigo FROM cliente WHERE codigo IS NOT NULL');
  const ocupados = new Set(usados.map(linha => linha.codigo));

  const livres = [];
  for (let n = 0; n < 1000; n++) {
    const codigo = 'CLI' + String(n).padStart(3, '0');
    if (!ocupados.has(codigo)) livres.push(codigo);
  }

  if (livres.length === 0) {
    throw new Error('Não há mais códigos de cliente disponíveis.');
  }

  return livres[Math.floor(Math.random() * livres.length)];
}

module.exports = { gerarCodigoCliente };