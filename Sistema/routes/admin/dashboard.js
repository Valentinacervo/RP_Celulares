var express = require('express');
var router = express.Router();
const db = require('../../db');
const { gerarCodigoCliente } = require('../../utils/codigoCliente');
const opcoes = require('../../utils/opcoesConserto');
const { gerarCodigoConserto } = require('../../utils/codigoConserto');
const { buscarResumoGrafico, buscarAvisos, buscarTodosAvisos, buscarNotas, salvarNotas } = require('../../utils/painelConsertos');

// Por quantos dias um conserto concluído continua aparecendo em "Consertos concluídos".
// Depois disso ele só aparece no histórico do cliente (não é apagado do banco).
const DIAS_CONSERTOS_CONCLUIDOS = 90;

/* Middleware de Proteção */
function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

/* GET home page - Painel Geral de Consertos */
router.get('/', verificarAutenticacao, async function(req, res, next) {
  try {
    const [resumo, avisos, notas] = await Promise.all([
      buscarResumoGrafico(),
      buscarAvisos(),
      buscarNotas()
    ]);

    res.render('admin/consertos/dashboard', {
      title: 'Painel Geral de Consertos',
      usuario: req.session.usuarioLogado,
      resumo,
      avisos,
      notas
    });
  } catch (err) {
    next(err);
  }
});

/* Salvar o Bloco de Notas do painel */
router.post('/bloco-notas', verificarAutenticacao, async function(req, res, next) {
  try {
    const texto = (req.body.texto || '').toString().replace(/\r\n/g, '\n').trim();

    if (texto.length > 2000) {
      return res.status(400).json({ erro: 'As anotações aceitam no máximo 2000 caracteres.' });
    }

    await salvarNotas(texto);
    res.json({ texto });
  } catch (err) {
    next(err);
  }
});

/* ------ CADASTRO DE CONSERTO ------ */

const REGEX_TELEFONE = /^\(\d{2}\) \d{5}-\d{4}$/;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

// Erro de validação que deve voltar para o formulário (não é erro do servidor)
class ErroFormulario extends Error {}

function hojeISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function renderFormularioConserto(req, res, { erro = null, sucesso = null, dados = {} } = {}) {
  const [ufs] = await db.query('SELECT id_uf, descricao FROM uf ORDER BY descricao');

  res.render('admin/consertos/adicionarconserto', {
    title: 'Adicionar Conserto',
    usuario: req.session.usuarioLogado,
    ufs,
    opcoes,
    erro,
    sucesso,
    dados,
    hoje: hojeISO()
  });
}

// Valida e limpa os dados do formulário. Lança ErroFormulario se algo estiver errado.
function tratarDadosConserto(body) {
  const t = (campo) => (body[campo] || '').toString().trim();

  const obrigatorios = [
    ['nome', 'o nome completo do cliente'],
    ['telefone', 'o telefone do cliente'],
    ['email', 'o e-mail do cliente'],
    ['rua', 'a rua / avenida'],
    ['numero', 'o número do endereço'],
    ['complemento', 'o complemento do endereço'],
    ['bairro', 'o bairro'],
    ['cep', 'o CEP'],
    ['cidade', 'a cidade'],
    ['id_uf', 'o estado'],
    ['data_abertura', 'a data de abertura'],
    ['data_prevista', 'a data prevista de entrega'],
    ['tipo_aparelho', 'o tipo de aparelho'],
    ['marca', 'a marca do aparelho'],
    ['modelo', 'o modelo do aparelho'],
    ['servico_solicitado', 'o serviço solicitado'],
    ['descricao_problema', 'a descrição do problema']
  ];

  for (const [campo, rotulo] of obrigatorios) {
    if (!t(campo)) throw new ErroFormulario(`Preencha ${rotulo}.`);
  }

  const limites = {
    nome: 100, email: 100, rua: 30, complemento: 50, bairro: 50, cidade: 50,
    modelo: 100, acessorios: 200, descricao_problema: 500, observacoes_tecnicas: 500
  };
  for (const [campo, max] of Object.entries(limites)) {
    if (t(campo).length > max) {
      throw new ErroFormulario(`O campo "${campo.replace('_', ' ')}" aceita no máximo ${max} caracteres.`);
    }
  }

  if (!REGEX_TELEFONE.test(t('telefone'))) {
    throw new ErroFormulario('Telefone inválido. Use o formato (00) 00000-0000.');
  }
  if (t('contato_adicional') && !REGEX_TELEFONE.test(t('contato_adicional'))) {
    throw new ErroFormulario('Contato adicional inválido. Use o formato (00) 00000-0000.');
  }
  if (!/^\S+@\S+\.\S+$/.test(t('email'))) {
    throw new ErroFormulario('E-mail inválido.');
  }

  const digitosCep = t('cep').replace(/\D/g, '');
  if (digitosCep.length !== 8) {
    throw new ErroFormulario('CEP inválido. Use o formato 00000-000.');
  }

  const numero = Number(t('numero'));
  if (!Number.isInteger(numero) || numero < 0) {
    throw new ErroFormulario('Número do endereço inválido.');
  }

  const idUf = Number(t('id_uf'));
  if (!Number.isInteger(idUf) || idUf <= 0) {
    throw new ErroFormulario('Selecione o estado.');
  }

  // Marca: lista fixa + opção "Outra" (digitada à mão)
  let marca = t('marca');
  if (!opcoes.marcas.includes(marca)) throw new ErroFormulario('Marca inválida.');
  if (marca === 'Outra') {
    marca = t('marca_outra');
    if (!marca) throw new ErroFormulario('Informe a marca do aparelho.');
    if (marca.length > 50) throw new ErroFormulario('A marca aceita no máximo 50 caracteres.');
  }

    // Tipo de aparelho: lista fixa + opção "Outro" (digitado à mão)
  let tipoAparelho = t('tipo_aparelho');
  if (!opcoes.tiposAparelho.includes(tipoAparelho)) throw new ErroFormulario('Tipo de aparelho inválido.');
  if (tipoAparelho === 'Outro') {
    tipoAparelho = t('tipo_aparelho_outro');
    if (!tipoAparelho) throw new ErroFormulario('Informe o tipo de aparelho.');
    if (tipoAparelho.length > 30) throw new ErroFormulario('O tipo de aparelho aceita no máximo 30 caracteres.');
  }

  // Serviço solicitado: lista fixa + opção "Outro" (digitado à mão)
  let servico = t('servico_solicitado');
  if (!opcoes.servicos.includes(servico)) throw new ErroFormulario('Serviço solicitado inválido.');
  if (servico === 'Outro') {
    servico = t('servico_solicitado_outro');
    if (!servico) throw new ErroFormulario('Informe o serviço solicitado.');
    if (servico.length > 100) throw new ErroFormulario('O serviço solicitado aceita no máximo 100 caracteres.');
  }

  const formaPagamento = t('forma_pagamento');
  if (formaPagamento && !opcoes.formasPagamento.includes(formaPagamento)) {
    throw new ErroFormulario('Forma de pagamento inválida.');
  }

  let garantiaDias = null;
  if (t('garantia_dias') !== '') {
    garantiaDias = Number(t('garantia_dias'));
    if (!opcoes.garantias.some(g => g.valor === garantiaDias)) throw new ErroFormulario('Garantia inválida.');
  }

  let valor = null;
  if (t('valor') !== '') {
    valor = Number(t('valor'));
    if (!Number.isFinite(valor) || valor < 0) throw new ErroFormulario('Valor estimado inválido.');
    valor = Math.round(valor * 100) / 100;
  }

  if (!REGEX_DATA.test(t('data_abertura')) || !REGEX_DATA.test(t('data_prevista'))) {
    throw new ErroFormulario('Data inválida.');
  }
  if (t('data_prevista') < t('data_abertura')) {
    throw new ErroFormulario('A data prevista de entrega não pode ser anterior à data de abertura.');
  }

  return {
    idCliente: t('id_cliente') ? Number(t('id_cliente')) : null,
    nome: t('nome'),
    telefone: t('telefone'),
    email: t('email'),
    contatoAdicional: t('contato_adicional') || null,
    endereco: [
      t('rua'), numero, t('complemento'), t('bairro'),
      `${digitosCep.slice(0, 5)}-${digitosCep.slice(5)}`, t('cidade'), idUf
    ],
    conserto: {
      dataAbertura: t('data_abertura'),
      dataPrevista: t('data_prevista'),
      tipoAparelho,
      marca,
      modelo: t('modelo'),
      acessorios: t('acessorios') || null,
      servico,
      descricaoProblema: t('descricao_problema'),
      observacoes: t('observacoes_tecnicas') || null,
      valor,
      formaPagamento: formaPagamento || null,
      garantiaDias
    }
  };
}

/* GET formulário de cadastro de conserto */
router.get('/adicionarconserto', verificarAutenticacao, async function(req, res, next) {
  try {
    await renderFormularioConserto(req, res, {
      sucesso: req.query.sucesso ? 'Conserto registrado com sucesso!' : null
    });
  } catch (err) {
    next(err);
  }
});

/* GET busca de clientes (barra de pesquisa do formulário) */
router.get('/adicionarconserto/buscar-clientes', verificarAutenticacao, async function(req, res, next) {
  try {
    const termo = (req.query.q || '').toString().trim();

    if (termo.length < 2) {
      return res.json([]);
    }

    // Escapa % e _ para não funcionarem como curingas do LIKE
    const like = `%${termo.replace(/[\\%_]/g, '\\$&')}%`;

    const [clientes] = await db.query(
      `SELECT c.id_cliente, c.codigo, c.nome, c.telefone, c.email, c.contato_adicional,
              e.rua, e.numero, e.complemento, e.bairro, e.cep, e.cidade, e.id_uf
       FROM cliente c
       LEFT JOIN endereco e ON e.id_endereco = c.id_endereco
       WHERE c.nome LIKE ? OR c.codigo LIKE ?
       ORDER BY c.nome
       LIMIT 8`,
      [like, like]
    );

    res.json(clientes);
  } catch (err) {
    next(err);
  }
});

/* POST salvar conserto (cadastra o cliente junto, se ele ainda não existir) */
router.post('/adicionarconserto', verificarAutenticacao, async function(req, res, next) {
  let conexao;

  try {
    const d = tratarDadosConserto(req.body);

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    let idCliente = d.idCliente;
    let idEndereco = null;

    // Cliente já cadastrado (escolhido na busca)
    if (idCliente) {
      const [existente] = await conexao.query(
        'SELECT id_endereco FROM cliente WHERE id_cliente = ?',
        [idCliente]
      );
      if (existente.length === 0) {
        throw new ErroFormulario('O cliente selecionado não foi encontrado. Faça a busca novamente.');
      }
      idEndereco = existente[0].id_endereco;
    }

    // E-mail e telefone não podem pertencer a outro cliente
    const dica = idCliente ? '' : ' Use a busca no topo da página para selecioná-lo.';

    const [telefoneEmUso] = await conexao.query(
      'SELECT 1 FROM cliente WHERE telefone = ? AND id_cliente <> ? LIMIT 1',
      [d.telefone, idCliente || 0]
    );
    if (telefoneEmUso.length > 0) {
      throw new ErroFormulario('Já existe outro cliente cadastrado com esse telefone.' + dica);
    }

    const [emailEmUso] = await conexao.query(
      'SELECT 1 FROM cliente WHERE email = ? AND id_cliente <> ? LIMIT 1',
      [d.email, idCliente || 0]
    );
    if (emailEmUso.length > 0) {
      throw new ErroFormulario('Já existe outro cliente cadastrado com esse e-mail.' + dica);
    }

    // Endereço: atualiza o do cliente ou cria um novo
    if (idEndereco) {
      await conexao.query(
        `UPDATE endereco
         SET rua = ?, numero = ?, complemento = ?, bairro = ?, cep = ?, cidade = ?, id_uf = ?
         WHERE id_endereco = ?`,
        [...d.endereco, idEndereco]
      );
    } else {
      const [resultadoEndereco] = await conexao.query(
        `INSERT INTO endereco (rua, numero, complemento, bairro, cep, cidade, id_uf)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        d.endereco
      );
      idEndereco = resultadoEndereco.insertId;
    }

    // Cliente: atualiza os dados ou cadastra um novo
    if (idCliente) {
      await conexao.query(
        `UPDATE cliente
         SET nome = ?, telefone = ?, email = ?, contato_adicional = ?, id_endereco = ?
         WHERE id_cliente = ?`,
        [d.nome, d.telefone, d.email, d.contatoAdicional, idEndereco, idCliente]
      );
    } else {
      const codigo = await gerarCodigoCliente();
      const [resultadoCliente] = await conexao.query(
        `INSERT INTO cliente (codigo, nome, telefone, email, contato_adicional, id_endereco)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [codigo, d.nome, d.telefone, d.email, d.contatoAdicional, idEndereco]
      );
      idCliente = resultadoCliente.insertId;
    }

    // Conserto
    const c = d.conserto;
    const codigoConserto = await gerarCodigoConserto(conexao);
    await conexao.query(
      `INSERT INTO conserto
       (codigo, id_cliente, data_solicitada, data_prometida, tipo_aparelho, marca, modelo,
        acessorios, tipo_conserto, descricao_problema, observacoes_tecnicas,
        valor, forma_pagamento, garantia_dias, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pendente')`,
      [
        codigoConserto, idCliente, c.dataAbertura, c.dataPrevista, c.tipoAparelho, c.marca, c.modelo,
        c.acessorios, c.servico, c.descricaoProblema, c.observacoes,
        c.valor, c.formaPagamento, c.garantiaDias
      ]
    );

    await conexao.commit();
    res.redirect('/admin/adicionarconserto?sucesso=1');

  } catch (err) {
    if (conexao) await conexao.rollback().catch(() => {});

    if (err instanceof ErroFormulario) {
      return renderFormularioConserto(req, res, { erro: err.message, dados: req.body }).catch(next);
    }
    next(err);

  } finally {
    if (conexao) conexao.release();
  }
});


/* ------ LISTAGEM DE CONSERTOS ------ */

async function listarConsertos(req, res, next, { status, destacados, ultimosDias, titulo, paginaAtual, vazio }) {
  try {
    const busca = (req.query.busca || '').toString().replace('#', '').trim();

    let query = `
      SELECT
        conserto.id_conserto,
        conserto.codigo,
        conserto.tipo_conserto AS servico,
        conserto.status,
        conserto.destacado,
        DATE_FORMAT(conserto.data_solicitada, '%d/%m/%Y') AS data_abertura,
        DATE_FORMAT(conserto.data_prometida, '%d/%m/%Y') AS data_prevista,
        cliente.nome AS cliente
      FROM conserto
      LEFT JOIN cliente ON conserto.id_cliente = cliente.id_cliente
    `;
    const condicoes = [];
    const params = [];

    if (status) {
      condicoes.push('conserto.status = ?');
      params.push(status);
    }

    if (destacados) {
      condicoes.push('conserto.destacado = 1');
    }

    // Limita pela data de conclusão (ou, se faltar, pela data de abertura)
    if (ultimosDias) {
      condicoes.push('COALESCE(conserto.data_conclusao, conserto.data_solicitada) >= DATE_SUB(CURDATE(), INTERVAL ? DAY)');
      params.push(ultimosDias);
    }

    if (busca) {
      condicoes.push('(conserto.codigo LIKE ? OR conserto.tipo_conserto LIKE ? OR cliente.nome LIKE ?)');
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }

    if (condicoes.length) query += ' WHERE ' + condicoes.join(' AND ');
    query += ' ORDER BY conserto.data_solicitada DESC, conserto.codigo DESC';

    const [consertos] = await db.query(query, params);

    res.render(`admin/consertos/${paginaAtual}`, {
      title: titulo,
      usuario: req.session.usuarioLogado,
      consertos,
      busca,
      vazio,
      ultimosDias: ultimosDias || null
    });
  } catch (err) {
    next(err);
  }
}

router.get('/todosconsertos', verificarAutenticacao, function(req, res, next) {
  listarConsertos(req, res, next, {
    status: null,
    titulo: 'Todos os Consertos',
    paginaAtual: 'todosconsertos',
    vazio: 'Nenhum conserto registrado.'
  });
});

router.get('/consertospendentes', verificarAutenticacao, function(req, res, next) {
  listarConsertos(req, res, next, {
    status: 'pendente',
    titulo: 'Consertos Pendentes',
    paginaAtual: 'consertospendentes',
    vazio: 'Nenhum conserto pendente.'
  });
});

router.get('/consertosconcluidos', verificarAutenticacao, function(req, res, next) {
  listarConsertos(req, res, next, {
    status: 'concluido',
    ultimosDias: DIAS_CONSERTOS_CONCLUIDOS,
    titulo: 'Consertos Concluídos',
    paginaAtual: 'consertosconcluidos',
    vazio: `Nenhum conserto concluído nos últimos ${DIAS_CONSERTOS_CONCLUIDOS} dias.`
  });
});

router.get('/destacados', verificarAutenticacao, function(req, res, next) {
  listarConsertos(req, res, next, {
    destacados: true,
    titulo: 'Destacados',
    paginaAtual: 'destacados',
    vazio: 'Nenhum conserto destacado. Clique na estrela de um conserto para destacá-lo.'
  });
});

/* Destacar / remover destaque de um conserto (botão de estrela) */
router.post('/consertos/:id/destacar', verificarAutenticacao, async function(req, res, next) {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ erro: 'Conserto inválido.' });
    }

    const [resultado] = await db.query(
      'UPDATE conserto SET destacado = 1 - destacado WHERE id_conserto = ?',
      [id]
    );

    if (resultado.affectedRows === 0) {
      return res.status(404).json({ erro: 'Conserto não encontrado.' });
    }

    const [linhas] = await db.query(
      'SELECT destacado FROM conserto WHERE id_conserto = ?',
      [id]
    );

    res.json({ destacado: Boolean(linhas[0].destacado) });
  } catch (err) {
    next(err);
  }
});

router.get('/avisosImportantes', verificarAutenticacao, async function(req, res, next) {
  try {
    const avisos = await buscarTodosAvisos();
    res.render('admin/consertos/avisosImportantes', {
      title: 'Avisos Importantes',
      usuario: req.session.usuarioLogado,
      avisos
    });
  } catch (err) {
    next(err);
  }
});

/* ------ DETALHES DO CONSERTO ------ */

const REGEX_CODIGO_CONSERTO = /^\d{5}$/;

const MENSAGENS_CONSERTO = {
  salvo: 'Dados do conserto atualizados com sucesso.',
  concluido: 'Conserto marcado como concluído.',
  reaberto: 'Conserto reaberto: voltou para pendente.'
};

async function buscarConsertoPorCodigo(codigo) {
  const [linhas] = await db.query(
    `SELECT
       co.id_conserto, co.codigo, co.id_cliente, co.status,
       co.tipo_aparelho, co.marca, co.modelo, co.acessorios,
       co.tipo_conserto, co.descricao_problema, co.observacoes_tecnicas,
       co.valor, co.forma_pagamento, co.garantia_dias,
       DATE_FORMAT(co.data_solicitada, '%d/%m/%Y') AS data_abertura,
       DATE_FORMAT(co.data_solicitada, '%Y-%m-%d') AS data_abertura_iso,
       DATE_FORMAT(co.data_prometida, '%Y-%m-%d') AS data_prevista_iso,
       DATE_FORMAT(co.data_conclusao, '%d/%m/%Y') AS data_conclusao_br,
       cl.codigo AS cliente_codigo,
       cl.nome AS cliente_nome,
       cl.telefone AS cliente_telefone,
       cl.email AS cliente_email,
       cl.contato_adicional AS cliente_contato_adicional
     FROM conserto co
     LEFT JOIN cliente cl ON cl.id_cliente = co.id_cliente
     WHERE co.codigo = ?
     LIMIT 1`,
    [codigo]
  );

  return linhas[0] || null;
}

// Valores que aparecem nos campos editáveis (do banco ou, se deu erro, do que foi digitado)
function valoresDoConserto(c) {
  return {
    data_prometida: c.data_prevista_iso || '',
    tipo_aparelho: c.tipo_aparelho || '',
    marca: c.marca || '',
    modelo: c.modelo || '',
    acessorios: c.acessorios || '',
    tipo_conserto: c.tipo_conserto || '',
    descricao_problema: c.descricao_problema || '',
    observacoes_tecnicas: c.observacoes_tecnicas || '',
    valor: c.valor ?? '',
    forma_pagamento: c.forma_pagamento || '',
    valor: c.valor ?? '',
    forma_pagamento: c.forma_pagamento || '',
    garantia_dias: c.garantia_dias ?? '',
    cliente_nome: c.cliente_nome || '',
    cliente_telefone: c.cliente_telefone || '',
    cliente_email: c.cliente_email || '',
    cliente_contato_adicional: c.cliente_contato_adicional || ''
  };
}
function renderDetalhesConserto(req, res, conserto, { erro = null, sucesso = null, valores = null } = {}) {
  res.render('admin/consertos/detalhesConserto', {
    title: 'Detalhes do Conserto',
    usuario: req.session.usuarioLogado,
    conserto,
    valores: valores || valoresDoConserto(conserto),
    opcoes,
    erro,
    sucesso
  });
}

function tratarEdicaoConserto(body, dataAbertura) {
  const t = (campo) => (body[campo] || '').toString().trim();

  const obrigatorios = [
    ['data_prometida', 'a data prevista de entrega'],
    ['tipo_aparelho', 'o tipo de aparelho'],
    ['marca', 'a marca do aparelho'],
    ['modelo', 'o modelo do aparelho'],
    ['tipo_conserto', 'o serviço solicitado'],
    ['descricao_problema', 'a descrição do problema']
  ];

  for (const [campo, rotulo] of obrigatorios) {
    if (!t(campo)) throw new ErroFormulario(`Preencha ${rotulo}.`);
  }

  const limites = {
    tipo_aparelho: ['tipo de aparelho', 30],
    marca: ['marca', 50],
    modelo: ['modelo', 100],
    acessorios: ['acessórios', 200],
    tipo_conserto: ['serviço solicitado', 100],
    descricao_problema: ['descrição do problema', 500],
    observacoes_tecnicas: ['observações técnicas', 500]
  };
  for (const [campo, [rotulo, max]] of Object.entries(limites)) {
    if (t(campo).length > max) {
      throw new ErroFormulario(`O campo "${rotulo}" aceita no máximo ${max} caracteres.`);
    }
  }

  if (!REGEX_DATA.test(t('data_prometida'))) {
    throw new ErroFormulario('Data prevista inválida.');
  }
  if (dataAbertura && t('data_prometida') < dataAbertura) {
    throw new ErroFormulario('A data prevista de entrega não pode ser anterior à data de abertura.');
  }

  const formaPagamento = t('forma_pagamento');
  if (formaPagamento && formaPagamento.length > 50) {
    throw new ErroFormulario('Forma de pagamento inválida.');
  }

  let garantiaDias = null;
  if (t('garantia_dias') !== '') {
    garantiaDias = Number(t('garantia_dias'));
    if (!opcoes.garantias.some(g => g.valor === garantiaDias)) throw new ErroFormulario('Garantia inválida.');
  }

  let valor = null;
  if (t('valor') !== '') {
    valor = Number(t('valor'));
    if (!Number.isFinite(valor) || valor < 0) throw new ErroFormulario('Valor inválido.');
    valor = Math.round(valor * 100) / 100;
  }
  // Dados do cliente (também podem ser corrigidos por esta tela)
  if (!t('cliente_nome')) throw new ErroFormulario('Preencha o nome completo do cliente.');
  if (t('cliente_nome').length > 100) {
    throw new ErroFormulario('O nome do cliente aceita no máximo 100 caracteres.');
  }

  if (!t('cliente_telefone')) throw new ErroFormulario('Preencha o telefone do cliente.');
  if (!REGEX_TELEFONE.test(t('cliente_telefone'))) {
    throw new ErroFormulario('Telefone inválido. Use o formato (00) 00000-0000.');
  }

  if (t('cliente_contato_adicional') && !REGEX_TELEFONE.test(t('cliente_contato_adicional'))) {
    throw new ErroFormulario('Contato adicional inválido. Use o formato (00) 00000-0000.');
  }

  if (!t('cliente_email')) throw new ErroFormulario('Preencha o e-mail do cliente.');
  if (t('cliente_email').length > 100) {
    throw new ErroFormulario('O e-mail do cliente aceita no máximo 100 caracteres.');
  }
  if (!/^\S+@\S+\.\S+$/.test(t('cliente_email'))) {
    throw new ErroFormulario('E-mail inválido.');
  }

  return {
    conserto: [
      t('data_prometida'), t('tipo_aparelho'), t('marca'), t('modelo'),
      t('acessorios') || null, t('tipo_conserto'), t('descricao_problema'),
      t('observacoes_tecnicas') || null, valor, formaPagamento || null, garantiaDias
    ],
    cliente: [
      t('cliente_nome'), t('cliente_telefone'), t('cliente_email'),
      t('cliente_contato_adicional') || null
    ]
  };
}

/* GET detalhes do conserto */
router.get('/consertos/:codigo', verificarAutenticacao, async function(req, res, next) {
  try {
    if (!REGEX_CODIGO_CONSERTO.test(req.params.codigo)) {
      return res.status(400).send('Código de conserto inválido.');
    }

    const conserto = await buscarConsertoPorCodigo(req.params.codigo);
    if (!conserto) {
      return res.status(404).send('Conserto não encontrado.');
    }

    renderDetalhesConserto(req, res, conserto, {
      sucesso: MENSAGENS_CONSERTO[req.query.msg] || null
    });
  } catch (err) {
    next(err);
  }
});

/* POST salvar alterações do conserto */
/* POST salvar alterações do conserto (e dos dados do cliente) */
router.post('/consertos/:codigo/editar', verificarAutenticacao, async function(req, res, next) {
  let conexao;

  try {
    if (!REGEX_CODIGO_CONSERTO.test(req.params.codigo)) {
      return res.status(400).send('Código de conserto inválido.');
    }

    const conserto = await buscarConsertoPorCodigo(req.params.codigo);
    if (!conserto) {
      return res.status(404).send('Conserto não encontrado.');
    }

    const dados = tratarEdicaoConserto(req.body, conserto.data_abertura_iso);

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    if (conserto.id_cliente) {
      const [nome, telefone, email] = dados.cliente;

      // Telefone e e-mail não podem pertencer a outro cliente
      const [telefoneEmUso] = await conexao.query(
        'SELECT 1 FROM cliente WHERE telefone = ? AND id_cliente <> ? LIMIT 1',
        [telefone, conserto.id_cliente]
      );
      if (telefoneEmUso.length > 0) {
        throw new ErroFormulario('Já existe outro cliente cadastrado com esse telefone.');
      }

      const [emailEmUso] = await conexao.query(
        'SELECT 1 FROM cliente WHERE email = ? AND id_cliente <> ? LIMIT 1',
        [email, conserto.id_cliente]
      );
      if (emailEmUso.length > 0) {
        throw new ErroFormulario('Já existe outro cliente cadastrado com esse e-mail.');
      }

      await conexao.query(
        `UPDATE cliente
         SET nome = ?, telefone = ?, email = ?, contato_adicional = ?
         WHERE id_cliente = ?`,
        [...dados.cliente, conserto.id_cliente]
      );
    }

    await conexao.query(
      `UPDATE conserto
       SET data_prometida = ?, tipo_aparelho = ?, marca = ?, modelo = ?,
           acessorios = ?, tipo_conserto = ?, descricao_problema = ?,
           observacoes_tecnicas = ?, valor = ?, forma_pagamento = ?, garantia_dias = ?
       WHERE id_conserto = ?`,
      [...dados.conserto, conserto.id_conserto]
    );

    await conexao.commit();
    res.redirect(`/admin/consertos/${conserto.codigo}?msg=salvo`);

  } catch (err) {
    if (conexao) await conexao.rollback().catch(() => {});

    if (err instanceof ErroFormulario) {
      try {
        const conserto = await buscarConsertoPorCodigo(req.params.codigo);
        res.status(400);
        return renderDetalhesConserto(req, res, conserto, {
          erro: err.message,
          valores: { ...valoresDoConserto(conserto), ...req.body }
        });
      } catch (erroTela) {
        return next(erroTela);
      }
    }
    next(err);

  } finally {
    if (conexao) conexao.release();
  }
});

/* POST marcar como concluído (grava a data de conclusão, que conta os 90 dias) */
router.post('/consertos/:codigo/concluir', verificarAutenticacao, async function(req, res, next) {
  try {
    if (!REGEX_CODIGO_CONSERTO.test(req.params.codigo)) {
      return res.status(400).send('Código de conserto inválido.');
    }

    const [resultado] = await db.query(
      `UPDATE conserto
       SET status = 'concluido', data_conclusao = CURDATE()
       WHERE codigo = ? AND status <> 'concluido'`,
      [req.params.codigo]
    );

    if (resultado.affectedRows === 0 && !(await buscarConsertoPorCodigo(req.params.codigo))) {
      return res.status(404).send('Conserto não encontrado.');
    }

    res.redirect(`/admin/consertos/${req.params.codigo}?msg=concluido`);
  } catch (err) {
    next(err);
  }
});

/* POST reabrir conserto (volta para pendente e limpa a data de conclusão) */
router.post('/consertos/:codigo/reabrir', verificarAutenticacao, async function(req, res, next) {
  try {
    if (!REGEX_CODIGO_CONSERTO.test(req.params.codigo)) {
      return res.status(400).send('Código de conserto inválido.');
    }

    const [resultado] = await db.query(
      `UPDATE conserto
       SET status = 'pendente', data_conclusao = NULL
       WHERE codigo = ? AND status = 'concluido'`,
      [req.params.codigo]
    );

    if (resultado.affectedRows === 0 && !(await buscarConsertoPorCodigo(req.params.codigo))) {
      return res.status(404).send('Conserto não encontrado.');
    }

    res.redirect(`/admin/consertos/${req.params.codigo}?msg=reaberto`);
  } catch (err) {
    next(err);
  }
});

module.exports = router;