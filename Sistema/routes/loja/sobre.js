var express = require('express');
var router = express.Router();

/* GET página sobre nós */
router.get('/', function(req, res, next) {
  res.render('loja/sobre', { title: 'Você está na página Sobre Nós' });
});

module.exports = router;
