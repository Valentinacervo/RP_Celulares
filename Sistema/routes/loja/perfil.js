var express = require('express');
var router = express.Router();

// Função para verificar se o CLIENTE está logado
function verificarLoginCliente(req, res, next) {
    if (req.session.clienteLogado) {
        return next();
    }
    // Redireciona para o login com o aviso na URL
    res.redirect('/login?mensagem=precisa_login');
}

/* GET página de perfil */
router.get('/', verificarLoginCliente, function(req, res, next) {
    res.render('loja/perfil', { 
        title: 'Meu Perfil', 
        cliente: req.session.clienteLogado 
    });
});

module.exports = router;
