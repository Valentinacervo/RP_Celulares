const db = require('../db');

const DIAS_ENTREGA_PROXIMA = 3;

const DIAS_AVISO_RECENTE = 7;


const MAX_AVISOS = 4;

// Na página de avisos o histórico é mais longo que no painel
const DIAS_AVISO_DETALHADO = 30;

const ICONES = {
  entrega: '/images/avisos/icone-entrega-proxima.png',
  conserto: '/images/avisos/icone-conserto.png',
  semEstoque: '/images/avisos/icone-produto-semEstoque.png'
};

function plural(numero, singular, pluralPalavra) {
  return numero === 1 ? singular : pluralPalavra;
}

// ---------- GRÁFICO: concluídos, pendentes e urgentes ----------
async function buscarResumoGrafico() {
  const [[linha]] = await db.query(
    `SELECT
       SUM(status = 'concluido') AS concluidos,
       SUM(status = 'pendente') AS pendentes,
       SUM(status = 'pendente'
           AND data_prometida IS NOT NULL
           AND data_prometida <= DATE_ADD(CURDATE(), INTERVAL ? DAY)) AS urgentes
     FROM conserto`,
    [DIAS_ENTREGA_PROXIMA]
  );

  // SUM devolve texto (ou NULL quando a tabela está vazia)
  return {
    concluidos: Number(linha.concluidos) || 0,
    pendentes: Number(linha.pendentes) || 0,
    urgentes: Number(linha.urgentes) || 0
  };
}

// ---------- AVISOS IMPORTANTES ----------
async function buscarAvisos() {
  const [entregas] = await db.query(
    `SELECT id_conserto, codigo,
            DATE_FORMAT(data_prometida, '%d/%m/%Y') AS data,
            DATEDIFF(data_prometida, CURDATE()) AS dias
     FROM conserto
     WHERE status = 'pendente'
       AND data_prometida IS NOT NULL
       AND data_prometida <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_prometida ASC, id_conserto ASC
     LIMIT 2`,
    [DIAS_ENTREGA_PROXIMA]
  );

  const [concluidos] = await db.query(
    `SELECT id_conserto, codigo, DATE_FORMAT(data_conclusao, '%d/%m/%Y') AS data
     FROM conserto
     WHERE status = 'concluido'
       AND data_conclusao IS NOT NULL
       AND data_conclusao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_conclusao DESC, id_conserto DESC
     LIMIT 2`,
    [DIAS_AVISO_RECENTE]
  );

  const [novos] = await db.query(
    `SELECT id_conserto, codigo, tipo_aparelho, DATE_FORMAT(data_solicitada, '%d/%m/%Y') AS data
     FROM conserto
     WHERE data_solicitada >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_solicitada DESC, id_conserto DESC
     LIMIT 2`,
    [DIAS_AVISO_RECENTE]
  );

  // estoque = 0 é esgotado; NULL (estoque nunca informado) não conta
  const [esgotados] = await db.query(
    `SELECT id_produto, nome
     FROM produto
     WHERE ativo = 1 AND estoque = 0
     ORDER BY id_produto DESC
     LIMIT 2`
  );

  const linkConserto = (conserto) => (conserto.codigo ? `/admin/consertos/${conserto.codigo}` : '/admin/todosconsertos');
  const codigo = (conserto) => (conserto.codigo ? `#${conserto.codigo}` : '(sem código)');

  const listaEntregas = entregas.map(conserto => {
    const dias = Number(conserto.dias);
    let texto;

    if (dias < 0) {
      const atraso = Math.abs(dias);
      texto = `Prazo vencido: conserto ${codigo(conserto)} está atrasado há ${atraso} ${plural(atraso, 'dia', 'dias')} (${conserto.data})`;
    } else if (dias === 0) {
      texto = `Entrega hoje: o prazo do conserto ${codigo(conserto)} termina hoje (${conserto.data})`;
    } else {
      texto = `Entrega próxima: conserto ${codigo(conserto)} - falta ${dias} ${plural(dias, 'dia', 'dias')} para o prazo (${conserto.data})`;
    }

    return { tipo: 'entrega', icone: ICONES.entrega, alerta: dias <= 0, texto, link: linkConserto(conserto) };
  });

  const listaConcluidos = concluidos.map(conserto => ({
    tipo: 'concluido',
    icone: ICONES.conserto,
    texto: `Conserto ${codigo(conserto)} concluído e pronto para retirada - ${conserto.data}`,
    link: linkConserto(conserto)
  }));

  const listaNovos = novos.map(conserto => ({
    tipo: 'novo',
    icone: ICONES.conserto,
    texto: `Novo conserto registrado: conserto ${codigo(conserto)} ${conserto.tipo_aparelho || ''}`.trim() + ` - ${conserto.data}`,
    link: linkConserto(conserto)
  }));

  const listaEsgotados = esgotados.map(produto => ({
    tipo: 'esgotado',
    icone: ICONES.semEstoque,
    texto: `Produto esgotado: ${produto.nome}`,
    link: '/admin/produtos'
  }));

  // Um aviso de cada tipo por vez (entrega, concluído, novo, esgotado), para variar o painel
  const grupos = [listaEntregas, listaConcluidos, listaNovos, listaEsgotados];
  const avisos = [];

  for (let posicao = 0; posicao < 2; posicao++) {
    grupos.forEach(grupo => {
      if (grupo[posicao]) avisos.push(grupo[posicao]);
    });
  }

  return avisos.slice(0, MAX_AVISOS);
}

// ---------- AVISOS IMPORTANTES (página detalhada) ----------
// Cada aviso: categoria ('conserto' | 'loja'), titulo, descricao (trechos; italico = destaque), data e ordem
async function buscarTodosAvisos() {
  const [entregas] = await db.query(
    `SELECT codigo,
            DATE_FORMAT(data_prometida, '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(data_prometida) AS ordem,
            DATEDIFF(data_prometida, CURDATE()) AS dias
     FROM conserto
     WHERE status = 'pendente'
       AND data_prometida IS NOT NULL
       AND data_prometida <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_prometida ASC`,
    [DIAS_ENTREGA_PROXIMA]
  );

  const [concluidos] = await db.query(
    `SELECT codigo,
            DATE_FORMAT(data_conclusao, '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(data_conclusao) AS ordem
     FROM conserto
     WHERE status = 'concluido'
       AND data_conclusao IS NOT NULL
       AND data_conclusao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_conclusao DESC`,
    [DIAS_AVISO_DETALHADO]
  );

  const [novos] = await db.query(
    `SELECT codigo, marca, modelo, tipo_aparelho,
            DATE_FORMAT(data_solicitada, '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(data_solicitada) AS ordem
     FROM conserto
     WHERE data_solicitada >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_solicitada DESC`,
    [DIAS_AVISO_DETALHADO]
  );

  // estoque = 0 é esgotado; NULL (estoque nunca informado) não conta.
  // A tabela não guarda a data em que o estoque zerou, então o aviso leva a data de hoje.
  const [esgotados] = await db.query(
    `SELECT nome,
            DATE_FORMAT(CURDATE(), '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(CURDATE()) AS ordem
     FROM produto
     WHERE ativo = 1 AND estoque = 0
     ORDER BY id_produto DESC`
  );

  const codigo = (conserto) => (conserto.codigo ? `#${conserto.codigo}` : '(sem código)');
  const avisos = [];

  entregas.forEach(conserto => {
    const dias = Number(conserto.dias);
    let descricao;

    if (dias < 0) {
      const atraso = Math.abs(dias);
      descricao = [
        { texto: 'Prazo de entrega do conserto ' },
        { texto: codigo(conserto), italico: true },
        { texto: ` vencido há ${atraso} ${plural(atraso, 'dia', 'dias')}` }
      ];
    } else if (dias === 0) {
      descricao = [
        { texto: 'O prazo de entrega do conserto ' },
        { texto: codigo(conserto), italico: true },
        { texto: ' termina hoje' }
      ];
    } else {
      descricao = [
        { texto: `Falta ${dias} ${plural(dias, 'dia', 'dias')} para o prazo de entrega do conserto ` },
        { texto: codigo(conserto), italico: true }
      ];
    }

    avisos.push({ categoria: 'conserto', icone: ICONES.entrega, titulo: 'Entrega próxima', descricao, data: conserto.data, ordem: Number(conserto.ordem) });
  });

  concluidos.forEach(conserto => {
    avisos.push({
      categoria: 'conserto',
      icone: ICONES.conserto,
      titulo: 'Conserto finalizado',
      descricao: [
        { texto: 'Conserto ' },
        { texto: codigo(conserto), italico: true },
        { texto: ' concluído e pronto para retirada' }
      ],
      data: conserto.data,
      ordem: Number(conserto.ordem)
    });
  });

  novos.forEach(conserto => {
    const aparelho = [conserto.marca, conserto.modelo].filter(Boolean).join(' ') || conserto.tipo_aparelho || '';
    avisos.push({
      categoria: 'conserto',
      icone: ICONES.conserto,
      titulo: 'Novo conserto registrado',
      descricao: [{ texto: `${codigo(conserto)} ${aparelho}`.trim(), italico: true }],
      data: conserto.data,
      ordem: Number(conserto.ordem)
    });
  });

  esgotados.forEach(produto => {
    avisos.push({
      categoria: 'loja',
      icone: ICONES.semEstoque,
      titulo: 'Produto indisponível no estoque da loja',
      descricao: [
        { texto: 'Produto ' },
        { texto: produto.nome, italico: true },
        { texto: ' esgotado' }
      ],
      data: produto.data,
      ordem: Number(produto.ordem)
    });
  });

  // Mais recentes primeiro
  avisos.sort((a, b) => b.ordem - a.ordem);

  return avisos;
}

// ---------- BLOCO DE NOTAS ----------
async function buscarNotas() {
  const [linhas] = await db.query('SELECT texto FROM bloco_notas WHERE id = 1');
  return linhas.length ? (linhas[0].texto || '') : '';
}

async function salvarNotas(texto) {
  await db.query(
    'INSERT INTO bloco_notas (id, texto) VALUES (1, ?) ON DUPLICATE KEY UPDATE texto = ?',
    [texto, texto]
  );
}

module.exports = { buscarResumoGrafico, buscarAvisos, buscarTodosAvisos, buscarNotas, salvarNotas };