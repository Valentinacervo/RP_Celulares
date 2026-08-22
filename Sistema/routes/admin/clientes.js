var express = require('express');
var router = express.Router();
const db = require('../../db');

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
        OR CONCAT('CLI', LPAD(cliente.id_cliente, 3, '0')) LIKE ?
      `;
      const buscaTelefone = busca.replace(/\D/g, '');
      params.push(`%${busca}%`, `%${buscaTelefone}%`, `%${busca}%`);
    }

    query += ' ORDER BY cliente.id_cliente DESC';

    const [clientes] = await db.query(query, params);

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
    const { nome, cpf, data_nasc, telefone, email, contato_adicional } = req.body;

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

    await db.query(
      `INSERT INTO cliente (nome, cpf, data_nasc, telefone, email, contato_adicional)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [nome, cpf, data_nasc, telefone, email, contato_adicional || null]
    );

    res.redirect('/admin/clientes');

  } catch (err) {
    next(err);
  }
});

module.exports = router;