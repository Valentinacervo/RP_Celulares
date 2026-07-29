var express = require('express');
var router = express.Router();
const multer = require('multer'); 
const path = require('path');  

/* Configuração do Multer (upload de foto) */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'public/images/perfil/'); 
  },
  filename: function (req, file, cb) {
    const extensao = path.extname(file.originalname);
    const nomeArquivo = req.session.usuarioLogado.nome_usuario + '_' + Date.now() + extensao;
    cb(null, nomeArquivo);
  }
});

const upload = multer({ storage: storage });

/* Middleware de Proteção */
function verificarAutenticacao(req, res, next) {
  if (req.session.usuarioLogado) {
    return next();
  }
  res.redirect('/login');
}

/* GET home page - Painel Geral de Consertos */
router.get('/', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/dashboard', { 
    title: 'Painel Geral de Consertos',
    usuario: req.session.usuarioLogado
  });
});

/* Rota de Upload da Foto */
router.post('/upload-foto', verificarAutenticacao, upload.single('foto'), function(req, res) {
  if (!req.file) {
    return res.status(400).send('Nenhuma foto foi enviata.');
  }
  const caminhoFoto = '/images/perfil/' + req.file.filename;
  req.session.usuarioLogado.foto = caminhoFoto;

  res.redirect('/admin'); 
});

/* Sub-rotas da área de consertos */

router.get('/avisosImportantes', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/avisosImportantes', { title: 'Avisos Importantes', usuario: req.session.usuarioLogado });
});

router.get('/destacados', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/destacados', { title: 'Destacados', usuario: req.session.usuarioLogado });
});

router.get('/adicionarconserto', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/adicionarconserto', { title: 'Adicionar Conserto', usuario: req.session.usuarioLogado });
});

router.get('/todosconsertos', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/todosconsertos', { title: 'Todos os Consertos', usuario: req.session.usuarioLogado });
});

router.get('/consertospendentes', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/consertospendentes', { title: 'Consertos Pendentes', usuario: req.session.usuarioLogado });
});

router.get('/consertosconcluidos', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/consertosconcluidos', { title: 'Consertos Concluídos', usuario: req.session.usuarioLogado });
});

router.get('/estoque', verificarAutenticacao, function(req, res, next) {
  res.render('admin/consertos/estoque', { title: 'Estoque de Peças', usuario: req.session.usuarioLogado });
});

module.exports = router;
