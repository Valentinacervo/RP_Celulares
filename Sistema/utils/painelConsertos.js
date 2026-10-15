const db = require('../db');

const DIAS_ENTREGA_PROXIMA = 3;

const DIAS_AVISO_RECENTE = 7;


const MAX_AVISOS = 3;

// Na página de avisos o histórico é mais longo que no painel
const DIAS_AVISO_DETALHADO = 30;

const ICONES = {
  entrega: '/images/avisos/icone-entrega-proxima.png',
  conserto: '/images/avisos/icone-conserto.png',
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


// ---------- AVISOS IMPORTANTES (painel da tela inicial) ----------
async function buscarAvisos() {
  const [entregas] = await db.query(
    `SELECT id_conserto AS id, codigo,
            DATE_FORMAT(data_prometida, '%d/%m/%Y') AS data,
            DATEDIFF(data_prometida, CURDATE()) AS dias
     FROM conserto
     WHERE status = 'pendente'
       AND data_prometida IS NOT NULL
       AND data_prometida <= DATE_ADD(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_prometida ASC, id_conserto ASC
     LIMIT ?`,
    [DIAS_ENTREGA_PROXIMA, MAX_AVISOS]
  );

  const [concluidos] = await db.query(
    `SELECT id_conserto AS id, codigo,
            DATE_FORMAT(data_conclusao, '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(data_conclusao) AS ordem
     FROM conserto
     WHERE status = 'concluido'
       AND data_conclusao IS NOT NULL
       AND data_conclusao >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_conclusao DESC, id_conserto DESC
     LIMIT ?`,
    [DIAS_AVISO_RECENTE, MAX_AVISOS]
  );

  const [novos] = await db.query(
    `SELECT id_conserto AS id, codigo, tipo_aparelho,
            DATE_FORMAT(data_solicitada, '%d/%m/%Y') AS data,
            UNIX_TIMESTAMP(data_solicitada) AS ordem
     FROM conserto
     WHERE data_solicitada >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ORDER BY data_solicitada DESC, id_conserto DESC
     LIMIT ?`,
    [DIAS_AVISO_RECENTE, MAX_AVISOS]
  );


  // Entregas próximas e produtos esgotados são situações de hoje (não há data do evento no banco), então entram na ordenação com a data de hoje.
  const [[{ hoje }]] = await db.query('SELECT UNIX_TIMESTAMP(CURDATE()) AS hoje');

  const codigo = (conserto) => (conserto.codigo ? `#${conserto.codigo}` : '(sem código)');

  // prioridade: em empate de data, conserto concluído > novo > entrega > esgotado
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

    return { tipo: 'entrega', icone: ICONES.entrega, alerta: dias <= 0, texto, ordem: Number(hoje), prioridade: 3, id: Number(conserto.id) };
  });

  const listaConcluidos = concluidos.map(conserto => ({
    tipo: 'concluido',
    icone: ICONES.conserto,
    texto: `Conserto ${codigo(conserto)} concluído e pronto para retirada - ${conserto.data}`,
    ordem: Number(conserto.ordem),
    prioridade: 1,
    id: Number(conserto.id)
  }));

  const listaNovos = novos.map(conserto => ({
    tipo: 'novo',
    icone: ICONES.conserto,
    texto: `Novo conserto registrado: conserto ${codigo(conserto)} ${conserto.tipo_aparelho || ''}`.trim() + ` - ${conserto.data}`,
    ordem: Number(conserto.ordem),
    prioridade: 2,
    id: Number(conserto.id)
  }));

  // Mais recente primeiro; só os MAX_AVISOS primeiros aparecem no painel
  return [...listaEntregas, ...listaConcluidos, ...listaNovos]
    .sort((a, b) => b.ordem - a.ordem || a.prioridade - b.prioridade || b.id - a.id)
    .slice(0, MAX_AVISOS);
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