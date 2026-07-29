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

/* GET lista de clientes */
router.get('/', verificarAutenticacao, async function(req, res, next) {
  try {
    const [rows] = await db.query('SELECT * FROM cliente ORDER BY id_cliente DESC');
    res.render('admin/clientes/lista', { 
      title: 'Lista de Clientes', 
      clientes: rows 
    });
  } catch (err) {
    next(err);
  }
});

/* GET formulário de cadastro */
router.get('/cadastro', verificarAutenticacao, function(req, res, next) {
  res.render('admin/clientes/cadastro', { title: 'Cadastro de Clientes' });
});

module.exports = router;
