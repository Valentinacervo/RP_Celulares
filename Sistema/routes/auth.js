var express = require('express');
var router = express.Router();
const bcrypt = require('bcrypt');
const db = require('../db');

/* GET tela de login (se já estiver logado, vai direto pro admin) */
router.get('/login', function(req, res) {
  if (req.session.usuarioLogado) {
    return res.redirect('/admin');
  }
  res.render('auth/login', { title: 'Login', erro: null });
});

/* POST login do admin */
router.post('/login', async function(req, res) {
  const { usuario, senha } = req.body;

  try {
    if (!usuario || !senha) {
      return res.render('auth/login', { title: 'Login', erro: 'Preencha todos os campos.' });
    }

    const [funcionarios] = await db.query(
      'SELECT * FROM funcionario WHERE nome_usuario = ? LIMIT 1',
      [usuario.trim()]
    );

    if (funcionarios.length > 0) {
      const funcionario = funcionarios[0];
      const senhaCorreta = await bcrypt.compare(senha, funcionario.senha);

      if (senhaCorreta) {
        // guarda na sessão sem o hash da senha
        delete funcionario.senha;
        req.session.usuarioLogado = funcionario;
        return res.redirect('/admin');
      }
    }

    return res.render('auth/login', { title: 'Login', erro: 'Usuário ou senha inválidos!' });

  } catch (err) {
    console.error(err);
    return res.status(500).send('Erro interno no servidor');
  }
});

/* GET logout */
router.get('/logout', function(req, res) {
  req.session.destroy(function(err) {
    if (err) {
      console.log('Erro ao sair:', err);
      return res.redirect('/admin');
    }
    res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

module.exports = router;