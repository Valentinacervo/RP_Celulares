var express = require('express');
var router = express.Router();
const db = require('../../db');

// Middleware de proteção
function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

router.use(verificarAutenticacao);

/* GET tela inicial de produtos */
router.get('/', async (req, res, next) => {
  try {
    const categoriaId = req.query.categoria || null;

    const [categorias] = await db.query(
      'SELECT * FROM categoria ORDER BY descricao'
    );

    let query = 'SELECT * FROM produto WHERE ativo = 1';
    const params = [];

    if (categoriaId) {
      query += ' AND id_categoria = ?';
      params.push(categoriaId);
    }

    query += ' ORDER BY vendas DESC LIMIT 3';

    const [produtos] = await db.query(query, params);

    res.render('admin/produtos/produtosAdmin', {
      title: 'Produtos',
      usuario: req.session.usuarioLogado,
      categorias,
      produtos,
      paginaAtual: 'inicio',
      categoriaSelecionada: categoriaId
    });

  } catch (err) {
    next(err);
  }
});

/* GET formulário de adicionar produto */
router.get('/adicionar', async (req, res, next) => {
  try {
    const [categorias] = await db.query(
      'SELECT * FROM categoria ORDER BY descricao'
    );

    res.render('admin/produtos/cadastro', {
      title: 'Adicionar produto',
      usuario: req.session.usuarioLogado,
      categorias,
      paginaAtual: 'adicionar-produto',
      categoriaSelecionada: null
    });

  } catch (err) {
    next(err);
  }
});

module.exports = router;