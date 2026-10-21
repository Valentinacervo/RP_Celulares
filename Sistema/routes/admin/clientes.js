var express = require('express');
var router = express.Router();
const db = require('../../db');
const { gerarCodigoCliente } = require('../../utils/codigoCliente');
const { anexarUltimoServico } = require('../../utils/ultimoServico');

function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

router.use(verificarAutenticacao);

/* GET tela inicial - listagem de clientes */
router.get('/', async (req, res, next) => {
  try {
    const busca = (req.query.busca || '').replace('#', '').trim();

    let query = `
      SELECT
        cliente.*,
        endereco.rua, endereco.numero, endereco.bairro,
        endereco.cidade, endereco.complemento,
        uf.descricao AS uf
      FROM cliente
      LEFT JOIN endereco ON cliente.id_endereco = endereco.id_endereco
      LEFT JOIN uf ON endereco.id_uf = uf.id_uf
    `;
    const params = [];

    if (busca) {
      query += `
        WHERE cliente.nome LIKE ?
        OR REPLACE(REPLACE(REPLACE(cliente.telefone, '(', ''), ')', ''), '-', '') LIKE ?
        OR cliente.codigo LIKE ?
      `;
      const buscaTelefone = busca.replace(/\D/g, '');
      params.push(`%${busca}%`, `%${buscaTelefone}%`, `%${busca}%`);
    }

    query += ' ORDER BY cliente.id_cliente DESC';

    const [clientes] = await db.query(query, params);

    // Anexa o último serviço (conserto ou compra) de cada cliente
    await anexarUltimoServico(clientes);

    res.render('admin/clientes/clientesAdmin', {
      title: 'Clientes',
      usuario: req.session.usuarioLogado,
      clientes,
      busca,
      paginaAtual: 'inicio'
    });

  } catch (err) {
    next(err);
  }
});

/* GET formulário de adicionar cliente */
router.get('/adicionar', async (req, res, next) => {
  try {
    const [ufs] = await db.query(
      'SELECT id_uf, descricao FROM uf ORDER BY descricao'
    );

    res.render('admin/clientes/adicionarClientes', {
      usuario: req.session.usuarioLogado,
      erro: null,
      ufs
    });

  } catch (err) {
    next(err);
  }
});

/* POST salvar novo cliente */
router.post('/adicionar', async (req, res, next) => {
  try {
   const {
  nome, cpf, data_nasc, telefone, email, contato_adicional, rua, numero, complemento, bairro, cep, cidade, id_uf } = req.body;

    const [ufs] = await db.query(
      'SELECT id_uf, descricao FROM uf ORDER BY descricao'
    );

    const regexTelefone = /^\(\d{2}\) \d{5}-\d{4}$/;

    if (!regexTelefone.test(telefone)) {
      return res.render('admin/clientes/adicionarClientes', {
        usuario: req.session.usuarioLogado,
        erro: 'Telefone inválido. Use o formato (00) 00000-0000.',
        ufs
      });
    }

    const [telefoneExistente] = await db.query(
      'SELECT 1 FROM cliente WHERE telefone = ? LIMIT 1',
      [telefone]
    );

    if (telefoneExistente.length > 0) {
      return res.render('admin/clientes/adicionarClientes', {
        usuario: req.session.usuarioLogado,
        erro: 'Já existe um cliente cadastrado com esse telefone.',
        ufs
      });
    }

    const [resultadoEndereco] = await db.query(
      `INSERT INTO endereco (rua, numero, complemento, bairro, cep, cidade, id_uf)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [rua, numero, complemento, bairro, cep, cidade, id_uf]
    );

    const codigo = await gerarCodigoCliente();

    await db.query(
      `INSERT INTO cliente (codigo, nome, cpf, data_nasc, telefone, email, contato_adicional, id_endereco)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [codigo, nome, cpf, data_nasc, telefone, email, contato_adicional || null, resultadoEndereco.insertId]
    );

    res.redirect('/admin/clientes');

  } catch (err) {
    next(err);
  }
});


/* GET - detalhes do cliente e histórico de consertos */
router.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Identificador de cliente inválido.');
    }

    const [clientes] = await db.query(`
      SELECT
        c.*,
        e.rua,
        e.numero,
        e.complemento,
        e.bairro,
        e.cep,
        e.cidade,
        e.id_uf,
        u.descricao AS uf
      FROM cliente c
      LEFT JOIN endereco e ON e.id_endereco = c.id_endereco
      LEFT JOIN uf u ON u.id_uf = e.id_uf
      WHERE c.id_cliente = ?
      LIMIT 1
    `, [id]);

    if (clientes.length === 0) {
      return res.status(404).send('Cliente não encontrado.');
    }

    const [consertos] = await db.query(`
      SELECT
        id_conserto,
        codigo,
        data_solicitada,
        data_prometida,
        tipo_aparelho,
        marca,
        modelo,
        acessorios,
        tipo_conserto,
        descricao_problema,
        observacoes_tecnicas,
        valor,
        forma_pagamento,
        garantia_dias,
        status
      FROM conserto
      WHERE id_cliente = ?
      ORDER BY data_solicitada DESC, id_conserto DESC
    `, [id]);

    const [ufs] = await db.query(`
      SELECT id_uf, descricao
      FROM uf
      ORDER BY descricao
    `);

    res.render('admin/clientes/detalhesCliente', {
      title: 'Detalhes do Cliente',
      usuario: req.session.usuarioLogado,
      cliente: clientes[0],
      consertos,
      ufs,
      erro: null,
      sucesso: null
    });
  } catch (err) {
    next(err);
  }
});


/* POST - atualizar dados do cliente */
router.post('/:id/editar', async (req, res, next) => {
  const id = Number(req.params.id);
  let conexao;

  try {
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).send('Identificador de cliente inválido.');
    }

    const campos = [
      'nome', 'cpf', 'data_nasc', 'telefone', 'email',
      'contato_adicional', 'rua', 'numero', 'complemento',
      'bairro', 'cep', 'cidade', 'id_uf'
    ];

    const dados = {};
    for (const campo of campos) {
      dados[campo] = (req.body[campo] || '').toString().trim();
    }

    if (
      !dados.nome ||
      !dados.telefone ||
      !dados.email ||
      !dados.rua ||
      !dados.numero ||
      !dados.bairro ||
      !dados.cep ||
      !dados.cidade ||
      !dados.id_uf
    ) {
      return res.status(400).send(
        'Preencha todos os campos obrigatórios.'
      );
    }

    if (!/^\(\d{2}\) \d{5}-\d{4}$/.test(dados.telefone)) {
      return res.status(400).send(
        'Telefone inválido. Use o formato (00) 00000-0000.'
      );
    }

    if (!/^\S+@\S+\.\S+$/.test(dados.email)) {
      return res.status(400).send('Informe um e-mail válido.');
    }

    if (dados.cpf && !/^\d{11}$/.test(dados.cpf.replace(/\D/g, ''))) {
      return res.status(400).send('Informe um CPF válido, com 11 dígitos.');
    }

    conexao = await db.getConnection();
    await conexao.beginTransaction();

    const [clientes] = await conexao.query(
      'SELECT id_cliente, id_endereco FROM cliente WHERE id_cliente = ?',
      [id]
    );

    if (clientes.length === 0) {
      await conexao.rollback();
      return res.status(404).send('Cliente não encontrado.');
    }

    const clienteAtual = clientes[0];

    const [duplicados] = await conexao.query(`
      SELECT id_cliente
      FROM cliente
      WHERE (telefone = ? OR email = ?)
        AND id_cliente <> ?
      LIMIT 1
    `, [dados.telefone, dados.email, id]);

    if (duplicados.length > 0) {
      await conexao.rollback();
      return res.status(409).send(
        'Esse telefone ou e-mail já pertence a outro cliente.'
      );
    }

    const [estado] = await conexao.query(
      'SELECT id_uf FROM uf WHERE id_uf = ?',
      [dados.id_uf]
    );

    if (estado.length === 0) {
      await conexao.rollback();
      return res.status(400).send('Estado inválido.');
    }

    let idEndereco = clienteAtual.id_endereco;

    if (idEndereco) {
      await conexao.query(`
        UPDATE endereco
        SET rua = ?, numero = ?, complemento = ?,
            bairro = ?, cep = ?, cidade = ?, id_uf = ?
        WHERE id_endereco = ?
      `, [
        dados.rua,
        dados.numero,
        dados.complemento || null,
        dados.bairro,
        dados.cep,
        dados.cidade,
        dados.id_uf,
        idEndereco
      ]);
    } else {
      const [novoEndereco] = await conexao.query(`
        INSERT INTO endereco
          (rua, numero, complemento, bairro, cep, cidade, id_uf)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `, [
        dados.rua,
        dados.numero,
        dados.complemento || null,
        dados.bairro,
        dados.cep,
        dados.cidade,
        dados.id_uf
      ]);

      idEndereco = novoEndereco.insertId;
    }

    await conexao.query(`
      UPDATE cliente
      SET nome = ?,
          cpf = ?,
          data_nasc = ?,
          telefone = ?,
          email = ?,
          contato_adicional = ?,
          id_endereco = ?
      WHERE id_cliente = ?
    `, [
      dados.nome,
      dados.cpf
        ? dados.cpf.replace(/\D/g, '')
        : null,
      dados.data_nasc || null,
      dados.telefone,
      dados.email,
      dados.contato_adicional || null,
      idEndereco,
      id
    ]);

    await conexao.commit();

    res.redirect(`/admin/clientes/${id}?salvo=1`);
  } catch (err) {
    if (conexao) {
      await conexao.rollback().catch(() => {});
    }
    next(err);
  } finally {
    if (conexao) conexao.release();
  }
});



module.exports = router;