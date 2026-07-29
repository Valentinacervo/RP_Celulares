var express = require('express');
var router = express.Router();
const db = require('../../db'); // Importa a conexão com o banco

// Middleware de proteção
function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

/* GET lista de produtos */
router.get('/', verificarAutenticacao, async function(req, res, next) {
  try {
    const [rows] = await db.query('SELECT * FROM produto ORDER BY id_produto DESC');
    res.render('admin/produtos/lista', { 
      title: 'Lista de Produtos', 
      produtos: rows 
    });
  } catch (err) {
    next(err);
  }
});

/* GET formulário de cadastro */
router.get('/cadastro', verificarAutenticacao, function(req, res, next) {
  res.render('admin/produtos/cadastro', { title: 'Cadastro de Produtos' });
});

module.exports = router;
